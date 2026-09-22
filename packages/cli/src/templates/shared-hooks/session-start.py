#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Session Start Hook - Inject structured context
"""
from __future__ import annotations

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import json
import os
import re
import shlex
import subprocess
import sys
from io import StringIO
from pathlib import Path


def _normalize_windows_shell_path(path_str: str) -> str:
    """Normalize Unix-style shell paths to real Windows paths.

    On Windows, shells like Git Bash / MSYS2 / Cygwin may report paths like
    `/d/Users/...` or `/cygdrive/d/Users/...`. `Path.resolve()` will misinterpret
    these as `D:/d/Users...` on drive D: (or similar), breaking repo root
    detection.

    This function is intentionally conservative: it only rewrites patterns that
    unambiguously represent a drive letter mount.
    """
    if not isinstance(path_str, str) or not path_str:
        return path_str

    # Only relevant on Windows; keep other platforms untouched.
    if not sys.platform.startswith("win"):
        return path_str

    p = path_str.strip()

    # Already a Windows drive path (C:\... or C:/...)
    if re.match(r"^[A-Za-z]:[\/]", p):
        return p

    # MSYS/Git-Bash style: /c/Users/... or /d/Work/...
    m = re.match(r"^/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        rest = rest.replace('/', '\\')
        return f"{drive}:\\{rest}"

    # Cygwin style: /cygdrive/c/Users/...
    m = re.match(r"^/cygdrive/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        rest = rest.replace('/', '\\')
        return f"{drive}:\\{rest}"

    # WSL mounted drive (sometimes leaked into env): /mnt/c/Users/...
    m = re.match(r"^/mnt/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        rest = rest.replace('/', '\\')
        return f"{drive}:\\{rest}"

    return path_str


FIRST_REPLY_NOTICE = """<first-reply-notice>
On the first visible assistant reply in this session, briefly acknowledge that mini-trellis SessionStart context loaded.
Choose the acknowledgment language in this order:
1. Use the language of the user's current request (the user message that triggered this reply).
2. If that request has no clear natural language, use an explicitly established project communication language.
3. If neither provides a language, output the language-neutral fallback exactly: `mini-trellis SessionStart ✓`.
Continue directly with the user's request after the acknowledgment.
The acknowledgment must not alter the language used for the remainder of the response.
This notice is one-shot: do not repeat it after the first visible assistant reply in this session.
</first-reply-notice>"""


# Force UTF-8 on stdin/stdout/stderr on Windows. Default codepage there is
# cp936 / cp1252 / etc. — non-ASCII content (Chinese task names, prd snippets)
# both in stdin (hook payload from host CLI) and stdout (our emitted blocks)
# raises UnicodeDecodeError / UnicodeEncodeError. Equivalent to `python -X utf8`
# but applied per-stream so we don't depend on host CLI's command wiring.
if sys.platform.startswith("win"):
    import io as _io
    for _stream_name in ("stdin", "stdout", "stderr"):
        _stream = getattr(sys, _stream_name, None)
        if _stream is None:
            continue
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
            except Exception:
                pass  # Optional Windows stream setup; keep hook startup non-fatal.
        elif hasattr(_stream, "detach"):
            try:
                setattr(sys, _stream_name, _io.TextIOWrapper(_stream.detach(), encoding="utf-8", errors="replace"))
            except Exception:
                pass  # Optional Windows stream setup; keep hook startup non-fatal.



def should_skip_injection() -> bool:
    """Check if any platform's non-interactive flag is set, or if Trellis
    hooks are explicitly disabled via TRELLIS_HOOKS=0 / TRELLIS_DISABLE_HOOKS=1.
    """
    if os.environ.get("TRELLIS_HOOKS") == "0":
        return True
    if os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return True
    non_interactive_vars = [
        "CLAUDE_NON_INTERACTIVE",
        "QODER_NON_INTERACTIVE",
        "CODEBUDDY_NON_INTERACTIVE",
        "FACTORY_NON_INTERACTIVE",
        "CURSOR_NON_INTERACTIVE",
        "GEMINI_NON_INTERACTIVE",
        "KIRO_NON_INTERACTIVE",
        "COPILOT_NON_INTERACTIVE",
        "TRAE_NON_INTERACTIVE",
        "ZCODE_NON_INTERACTIVE",
    ]
    return any(os.environ.get(var) == "1" for var in non_interactive_vars)


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def _repo_relative(repo_root: Path, path: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return str(path)


def _run_git(repo_root: Path, args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=3,
            cwd=str(repo_root),
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _format_git_state(repo_root: Path) -> str:
    branch = _run_git(repo_root, ["branch", "--show-current"]) or "(detached)"
    dirty_lines = [
        line for line in _run_git(repo_root, ["status", "--porcelain"]).splitlines()
        if line.strip()
    ]
    dirty_text = "clean" if not dirty_lines else f"dirty {len(dirty_lines)} paths"
    return f"Git: branch {branch}; {dirty_text}."


def _detect_platform(input_data: dict) -> str | None:
    if isinstance(input_data.get("cursor_version"), str):
        return "cursor"
    # CLAUDE_PROJECT_DIR is a compatibility alias that several hosts set
    # alongside their own variable — CodeBuddy, ZCode and Trae all do. It must
    # therefore be checked LAST, or every one of them is detected as claude and
    # the context key becomes `claude_<their-session-id>`. That key does not
    # match the session file `task.py start` wrote under the host's real name,
    # so every turn reports no_task while the pointer exists on disk.
    # Observed on CodeBuddy IDE 4.10.4: session file `codebuddy_ae54840e….json`
    # alongside marker `update-check-claude_ae54840e….marker`, same id.
    env_map = {
        "ZCODE_PROJECT_DIR": "zcode",
        "CURSOR_PROJECT_DIR": "cursor",
        "CODEBUDDY_PROJECT_DIR": "codebuddy",
        "FACTORY_PROJECT_DIR": "droid",
        "GEMINI_PROJECT_DIR": "gemini",
        "QODER_PROJECT_DIR": "qoder",
        "KIRO_PROJECT_DIR": "kiro",
        "COPILOT_PROJECT_DIR": "copilot",
        "TRAE_PROJECT_DIR": "trae",
        # Last: the shared alias, only meaningful once no vendor key matched.
        "CLAUDE_PROJECT_DIR": "claude",
    }
    for env_name, platform in env_map.items():
        if os.environ.get(env_name):
            return platform
    script_parts = set(Path(sys.argv[0]).parts)
    if ".claude" in script_parts:
        return "claude"
    if ".cursor" in script_parts:
        return "cursor"
    if ".codex" in script_parts:
        return "codex"
    if ".gemini" in script_parts:
        return "gemini"
    if ".qoder" in script_parts:
        return "qoder"
    if ".codebuddy" in script_parts:
        return "codebuddy"
    if ".factory" in script_parts:
        return "droid"
    if ".kiro" in script_parts:
        return "kiro"
    if ".trae" in script_parts:
        return "trae"
    if ".zcode" in script_parts:
        return "zcode"
    return None


def _resolve_context_key(trellis_dir: Path, input_data: dict) -> str | None:
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_context_key  # type: ignore[import-not-found]

    return resolve_context_key(input_data, platform=_detect_platform(input_data))


def _persist_context_key_for_bash(context_key: str | None) -> None:
    """Expose Trellis session identity to later Claude Code Bash commands.

    Claude Code SessionStart hooks can append exports to CLAUDE_ENV_FILE; those
    variables are then available to Bash tools in the same conversation. Without
    this bridge, `task.py start` has hook stdin during SessionStart but no
    session identity when the AI later runs it as a normal shell command.

    CLAUDE_ENV_FILE is user-owned (conda init, proxy settings, ...) and the host
    shell sources it for every command, so an unconditional append grows it
    without bound — one line per SessionStart forever. Skip the write when the
    *last* existing TRELLIS_CONTEXT_ID export already assigns this value. Last
    wins in shell, so only the final assignment describes the effective state:
    "the value appears somewhere in the file" would wrongly skip after a switch
    A -> B -> A, leaving the shell on B.
    """
    if not context_key:
        return
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file:
        return
    export_line = f"export TRELLIS_CONTEXT_ID={shlex.quote(context_key)}"
    try:
        if _last_context_key_export(env_file) == export_line:
            return
        with open(env_file, "a", encoding="utf-8") as handle:
            handle.write(f"{export_line}\n")
    except OSError:
        pass  # Optional shell bridge; keep session-start non-fatal.


def _last_context_key_export(env_file: str) -> str | None:
    """Return the last `export TRELLIS_CONTEXT_ID=` line in env_file, if any.

    A missing file means "no previous export" (the caller then creates it).
    `errors="replace"` matters: a user env file with non-UTF-8 bytes would
    otherwise raise UnicodeDecodeError, which is a ValueError — not an OSError —
    and would escape the caller's non-fatal guard.
    """
    last_export = None
    try:
        with open(env_file, "r", encoding="utf-8", errors="replace") as handle:
            for raw_line in handle:
                stripped = raw_line.strip()
                if stripped.startswith("export TRELLIS_CONTEXT_ID="):
                    last_export = stripped
    except FileNotFoundError:
        return None
    return last_export


def run_script(script_path: Path, context_key: str | None = None) -> str:
    try:
        if script_path.suffix == ".py":
            # Add PYTHONIOENCODING to force UTF-8 in subprocess
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            if context_key:
                env["TRELLIS_CONTEXT_ID"] = context_key
            cmd = [sys.executable, "-W", "ignore", str(script_path)]
        else:
            env = os.environ.copy()
            if context_key:
                env["TRELLIS_CONTEXT_ID"] = context_key
            cmd = [str(script_path)]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=script_path.parent.parent.parent,
            env=env,
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


def _load_trellis_config(trellis_dir: Path, input_data: dict) -> tuple:
    """Load Trellis config for session-start decisions.

    Returns:
        (is_mono, packages_dict, spec_scope, task_pkg, default_pkg)
    """
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        from common.config import get_default_package, get_packages, get_spec_scope, is_monorepo  # type: ignore[import-not-found]
        from common.paths import get_current_task  # type: ignore[import-not-found]

        repo_root = trellis_dir.parent
        is_mono = is_monorepo(repo_root)
        packages = get_packages(repo_root) or {}
        scope = get_spec_scope(repo_root)

        # Get active task's package
        task_pkg = None
        current = get_current_task(
            repo_root,
            input_data,
            platform=_detect_platform(input_data),
        )
        if current:
            task_json = repo_root / current / "task.json"
            if task_json.is_file():
                try:
                    data = json.loads(task_json.read_text(encoding="utf-8"))
                    if isinstance(data, dict):
                        tp = data.get("package")
                        if isinstance(tp, str) and tp:
                            task_pkg = tp
                except (json.JSONDecodeError, OSError):
                    pass  # Optional package metadata; fall back to default scope.

        default_pkg = get_default_package(repo_root)
        return is_mono, packages, scope, task_pkg, default_pkg
    except Exception:
        return False, {}, None, None, None


def _check_legacy_spec(trellis_dir: Path, is_mono: bool, packages: dict) -> str | None:
    """Check for legacy spec directory structure in monorepo.

    Returns warning message if legacy structure detected, None otherwise.
    """
    if not is_mono or not packages:
        return None

    spec_dir = trellis_dir / "spec"
    if not spec_dir.is_dir():
        return None

    # Check for legacy flat spec dirs (spec/backend/, spec/frontend/ with index.md)
    has_legacy = False
    for legacy_name in ("backend", "frontend"):
        legacy_dir = spec_dir / legacy_name
        if legacy_dir.is_dir() and (legacy_dir / "index.md").is_file():
            has_legacy = True
            break

    if not has_legacy:
        return None

    # Check which packages are missing spec/<pkg>/ directory
    missing = [
        name for name in sorted(packages.keys())
        if not (spec_dir / name).is_dir()
    ]

    if not missing:
        return None  # All packages have spec dirs

    if len(missing) == len(packages):
        return (
            f"[!] Legacy spec structure detected: found `spec/backend/` or `spec/frontend/` "
            f"but no package-scoped `spec/<package>/` directories.\n"
            f"Monorepo packages: {', '.join(sorted(packages.keys()))}\n"
            f"Please reorganize: `spec/backend/` -> `spec/<package>/backend/`"
        )
    return (
        f"[!] Partial spec migration detected: packages {', '.join(missing)} "
        f"still missing `spec/<pkg>/` directory.\n"
        f"Please complete migration for all packages."
    )


def _resolve_spec_scope(
    is_mono: bool,
    packages: dict,
    scope,
    task_pkg: str | None,
    default_pkg: str | None,
) -> set | None:
    """Resolve which packages should have their specs injected.

    Returns:
        Set of package names to include, or None for full scan.
    """
    if not is_mono or not packages:
        return None  # Single-repo: full scan

    if scope is None:
        return None  # No scope configured: full scan

    if isinstance(scope, str) and scope == "active_task":
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None  # Fallback to full scan

    if isinstance(scope, list):
        valid = set()
        for entry in scope:
            if entry in packages:
                valid.add(entry)
            else:
                print(
                    f"Warning: spec_scope contains unknown package: {entry}, ignoring",
                    file=sys.stderr,
                )

        if valid:
            # Warn if active task is out of scope
            if task_pkg and task_pkg not in valid:
                print(
                    f"Warning: active task package '{task_pkg}' is out of configured spec_scope",
                    file=sys.stderr,
                )
            return valid

        # All entries invalid: fallback chain
        print(
            "Warning: all spec_scope entries invalid, falling back to task/default/full",
            file=sys.stderr,
        )
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None  # Full scan

    return None  # Unknown scope type: full scan


def _collect_spec_index_paths(trellis_dir: Path, allowed_pkgs: set | None) -> list[str]:
    paths: list[str] = []
    guides_index = trellis_dir / "spec" / "guides" / "index.md"
    if guides_index.is_file():
        paths.append(".trellis/spec/guides/index.md")

    spec_dir = trellis_dir / "spec"
    if not spec_dir.is_dir():
        return paths

    for sub in sorted(spec_dir.iterdir()):
        if not sub.is_dir() or sub.name.startswith(".") or sub.name == "guides":
            continue

        index_file = sub / "index.md"
        if index_file.is_file():
            paths.append(f".trellis/spec/{sub.name}/index.md")
            continue

        if allowed_pkgs is not None and sub.name not in allowed_pkgs:
            continue
        for nested in sorted(sub.iterdir()):
            if not nested.is_dir():
                continue
            nested_index = nested / "index.md"
            if nested_index.is_file():
                paths.append(f".trellis/spec/{sub.name}/{nested.name}/index.md")

    return paths


def _collect_research_topics(trellis_dir: Path) -> list[str]:
    research_dir = trellis_dir / "research"
    if not research_dir.is_dir():
        return []
    topics: list[str] = []
    try:
        for path in sorted(research_dir.iterdir()):
            if path.name.startswith(".") or path.name.lower() == "readme.md":
                continue
            if path.is_file() and path.suffix.lower() == ".md":
                topics.append(f".trellis/research/{path.name}")
    except OSError:
        return []
    return topics


def _build_compact_current_state(
    trellis_dir: Path,
    spec_index_paths: list[str],
    research_topics: list[str],
) -> str:
    repo_root = trellis_dir.parent
    lines: list[str] = []

    try:
        from common.paths import get_active_journal_file, get_developer, count_lines  # type: ignore[import-not-found]
    except Exception:
        get_active_journal_file = None  # type: ignore[assignment]
        get_developer = None  # type: ignore[assignment]
        count_lines = None  # type: ignore[assignment]

    developer = get_developer(repo_root) if get_developer else None
    lines.append(f"Developer: {developer or '(not initialized)'}")
    lines.append(_format_git_state(repo_root))

    if get_active_journal_file and count_lines:
        journal = get_active_journal_file(repo_root)
        if journal:
            lines.append(
                f"Journal: {_repo_relative(repo_root, journal)}, {count_lines(journal)} / 2000 lines."
            )

    if spec_index_paths:
        lines.append(f"Spec indexes: {len(spec_index_paths)} available.")

    if research_topics:
        lines.append(f"Research notes: {len(research_topics)} in .trellis/research/.")
    else:
        lines.append("Research notes: none yet. Write .trellis/research/<topic>.md.")

    return "\n".join(lines)


def main():
    if should_skip_injection():
        sys.exit(0)

    try:
        hook_input = json.loads(sys.stdin.read())
        if not isinstance(hook_input, dict):
            hook_input = {}
    except (json.JSONDecodeError, ValueError):
        hook_input = {}

    # Try platform-specific env vars, hook cwd, fallback to cwd
    project_dir_env_vars = [
        "CLAUDE_PROJECT_DIR",
        "QODER_PROJECT_DIR",
        "CODEBUDDY_PROJECT_DIR",
        "FACTORY_PROJECT_DIR",
        "CURSOR_PROJECT_DIR",
        "GEMINI_PROJECT_DIR",
        "KIRO_PROJECT_DIR",
        "COPILOT_PROJECT_DIR",
        "TRAE_PROJECT_DIR",
        "ZCODE_PROJECT_DIR",
    ]
    project_dir = None
    for var in project_dir_env_vars:
        val = os.environ.get(var)
        if val:
            project_dir = Path(_normalize_windows_shell_path(val)).resolve()
            break
    if project_dir is None:
        project_dir = Path(_normalize_windows_shell_path(hook_input.get("cwd", "."))).resolve()

    trellis_dir = project_dir / ".trellis"
    context_key = _resolve_context_key(trellis_dir, hook_input)
    _persist_context_key_for_bash(context_key)

    # Load config for scope filtering and legacy detection
    is_mono, packages, scope_config, task_pkg, default_pkg = _load_trellis_config(
        trellis_dir,
        hook_input,
    )
    allowed_pkgs = _resolve_spec_scope(is_mono, packages, scope_config, task_pkg, default_pkg)

    output = StringIO()

    spec_index_paths = _collect_spec_index_paths(trellis_dir, allowed_pkgs)
    research_topics = _collect_research_topics(trellis_dir)
    source = hook_input.get("source") if isinstance(hook_input.get("source"), str) else ""

    output.write("""<session-context>
mini-trellis SessionStart context. Orient from journal, spec, and research.
</session-context>

""")
    output.write(FIRST_REPLY_NOTICE)
    output.write("\n\n")

    # Legacy migration warning
    legacy_warning = _check_legacy_spec(trellis_dir, is_mono, packages)
    if legacy_warning:
        output.write(f"<migration-warning>\n{legacy_warning}\n</migration-warning>\n\n")

    output.write("<current-state>\n")
    output.write(_build_compact_current_state(trellis_dir, spec_index_paths, research_topics))
    output.write("\n</current-state>\n\n")

    output.write("<guidelines>\n")
    output.write(
        "Memory: journal is git-durable session notes (`/mini-trellis:remember` or "
        "`python3 ./.trellis/scripts/add_session.py`). Cross-session dialogue is "
        "`mini-trellis mem list|search|context|extract`.\n"
        "Research lives in `.trellis/research/<topic>.md`; promote durable "
        "boundaries into `.trellis/spec/` as short markdown.\n\n"
    )

    if spec_index_paths:
        output.write("## Spec indexes (read on demand)\n")
        for p in spec_index_paths:
            output.write(f"- {p}\n")
        output.write("\n")

    if research_topics:
        output.write("## Research notes (read on demand)\n")
        for p in research_topics:
            output.write(f"- {p}\n")
        output.write("\n")

    if source == "compact":
        output.write(
            "This SessionStart was triggered by compact. If durable decisions "
            "or research from the compacted window are not in journal yet, "
            "run `/mini-trellis:remember` before continuing.\n"
        )
    output.write("</guidelines>\n\n")

    output.write("""<ready>
Context loaded. Use journal, spec, research, and `mini-trellis mem` on demand. Remember at session end or after compact.
</ready>""")

    context_text = output.getvalue()

    # Kiro (CLI trellis agent agentSpawn) adds a hook's stdout directly to the
    # conversation context — no JSON envelope. Emit the bare overview text.
    # Conditionally isolated: all other platforms keep the JSON path below.
    if _detect_platform(hook_input) == "kiro":
        print(context_text, flush=True)
        return

    platform = _detect_platform(hook_input)
    result: dict[str, object] = {
        # Claude Code / Qoder / CodeBuddy / Droid / Gemini / Copilot / Trae /
        # ZCode format.
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context_text,
        },
    }
    # Cursor sessionStart format (top-level snake_case per Cursor docs).
    # ZCode reads BOTH `hookSpecificOutput.additionalContext` and top-level
    # `additional_context` without deduplication, so emitting both keys would
    # duplicate the context in the conversation. Keep the previous shared output
    # shape for every other platform.
    if platform != "zcode":
        result["additional_context"] = context_text

    # Output JSON - stdout is already configured for UTF-8
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
