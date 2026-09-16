#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Codex Session Start Hook - Inject Trellis context into Codex sessions.

Output format follows Codex hook protocol:
  stdout JSON → { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import warnings
from io import StringIO
from pathlib import Path

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


warnings.filterwarnings("ignore")

FIRST_REPLY_NOTICE = """<first-reply-notice>
On the first visible assistant reply in this session, briefly acknowledge that Trellis SessionStart context loaded.
Choose the acknowledgment language in this order:
1. Use the language of the user's current request (the user message that triggered this reply).
2. If that request has no clear natural language, use an explicitly established project communication language.
3. If neither provides a language, output the language-neutral fallback exactly: `Trellis SessionStart ✓`.
Continue directly with the user's request after the acknowledgment.
The acknowledgment must not alter the language used for the remainder of the response.
This notice is one-shot: do not repeat it after the first visible assistant reply in this session.
</first-reply-notice>"""


def should_skip_injection() -> bool:
    if os.environ.get("TRELLIS_HOOKS") == "0":
        return True
    if os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return True
    return os.environ.get("CODEX_NON_INTERACTIVE") == "1"


def configure_project_encoding(project_dir: Path) -> None:
    """Reuse Trellis' shared Windows stdio encoding helper before JSON output."""
    scripts_dir = project_dir / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        from common import configure_encoding  # type: ignore[import-not-found]

        configure_encoding()
    except Exception:
        pass  # Optional encoding helper; host defaults are still usable.


def _resolve_context_key(project_dir: Path, hook_input: dict) -> str | None:
    scripts_dir = project_dir / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.active_task import resolve_context_key  # type: ignore[import-not-found]
    except Exception:
        return None
    return resolve_context_key(hook_input, platform="codex")


def run_script(script_path: Path, context_key: str | None = None) -> str:
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        if context_key:
            env["TRELLIS_CONTEXT_ID"] = context_key
        cmd = [sys.executable, "-W", "ignore", str(script_path)]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=str(script_path.parent.parent.parent),
            env=env,
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


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


def _repo_relative(repo_root: Path, path: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return str(path)


def _collect_spec_index_paths(trellis_dir: Path) -> list[str]:
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


def main() -> None:
    if should_skip_injection():
        sys.exit(0)

    # Read hook input from stdin
    try:
        hook_input = json.loads(sys.stdin.read())
        if not isinstance(hook_input, dict):
            hook_input = {}
        project_dir = Path(_normalize_windows_shell_path(hook_input.get("cwd", "."))).resolve()
    except (json.JSONDecodeError, KeyError):
        hook_input = {}
        project_dir = Path(".").resolve()

    configure_project_encoding(project_dir)

    trellis_dir = project_dir / ".trellis"
    spec_index_paths = _collect_spec_index_paths(trellis_dir)
    research_topics = _collect_research_topics(trellis_dir)
    source = hook_input.get("source") if isinstance(hook_input.get("source"), str) else ""

    output = StringIO()

    output.write("""<session-context>
Trellis compact SessionStart context. Orient from journal, spec, and research. Do not create or drive Trellis tasks.
</session-context>

""")
    output.write(FIRST_REPLY_NOTICE)
    output.write("\n\n")

    output.write("<current-state>\n")
    output.write(_build_compact_current_state(trellis_dir, spec_index_paths, research_topics))
    output.write("\n</current-state>\n\n")

    output.write("<guidelines>\n")
    output.write(
        "Memory: journal is git-durable session notes (`/trellis-remember` or "
        "`python3 ./.trellis/scripts/add_session.py`). Cross-session dialogue is "
        "`trellis mem list|search|context|extract` (ignore `--phase`).\n"
        "Research lives in `.trellis/research/<topic>.md`; promote durable "
        "boundaries into `.trellis/spec/` as short markdown.\n"
        "Do not create, start, or archive Trellis tasks from this context.\n\n"
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
            "run `/trellis-remember` before continuing.\n"
        )
    output.write("</guidelines>\n\n")

    output.write("""<ready>
Context loaded. Use journal, spec, research, and `trellis mem` on demand. Remember at session end or after compact.
</ready>""")

    context = output.getvalue()
    result = {
        "suppressOutput": True,
        "systemMessage": f"Trellis context injected ({len(context)} chars)",
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        },
    }

    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
