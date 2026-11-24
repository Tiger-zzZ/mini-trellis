"""Render the same bounded project knowledge entry for shell and JS hosts."""
from __future__ import annotations

import re
import sys
from pathlib import Path

INDEX = ".trellis/index.md"
MAX_CHARS = 1200
SKIP_DIRS = {"node_modules", "vendor", "dist", "build", "coverage", "out", "venv", "__pycache__"}


def _valid_target(root: Path, target: str) -> bool:
    path = Path(target)
    if path.is_absolute() or ".." in path.parts or path.suffix.lower() not in {".md", ".mdx"}:
        return False
    try:
        real = (root / path).resolve(strict=True)
        parts = real.relative_to(root).parts
        if real.suffix.lower() not in {".md", ".mdx"} or not real.is_file():
            return False
        if len(parts) > 2 and parts[0].lower() == ".trellis" and parts[1].lower() in {"spec", "research"}:
            return True
        # Explicit navigation may point into a child checkout or workspace package.
        for i, name in enumerate(parts):
            lower = name.lower()
            if lower in {"doc", "docs"} or (i == len(parts) - 1 and lower.startswith("readme")):
                owner = root.joinpath(*parts[:i])
                if owner == root or (owner / ".git").exists() or (owner / "package.json").is_file():
                    return True
            if name.startswith(".") or lower in SKIP_DIRS:
                break
        return False
    except (OSError, RuntimeError, ValueError):
        return False


def _parse_entry(text: str) -> tuple[str, str]:
    link = re.fullmatch(r"\[([^\]]+)\]\((.+)\)", text)
    if link:
        reason, target = link.groups()
        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1]
        return target, reason.strip()
    pair = re.fullmatch(r"`?(.+?\.mdx?)`?\s+[—-]\s+(.+)", text, re.IGNORECASE)
    return (pair[1], pair[2]) if pair else ("", "")


def knowledge_catalog(root: Path, spec_indexes: list[str]) -> str:
    root = root.resolve()
    index = root / INDEX
    rows: list[str] = []
    more = "More spec indexes: .trellis/spec/"
    notices: list[str] = []
    partial = False
    if index.exists() or index.is_symlink():
        try:
            if not index.resolve().is_relative_to(root) or not index.is_file():
                raise ValueError("invalid index")
            # A malformed or accidentally pasted long document must not stall a hook.
            with index.open(encoding="utf-8-sig") as src:
                content = src.read(65537)
            partial = len(content) > 65536
            if partial:
                content = content[:65536].rpartition("\n")[0]
            invalid: list[int] = []
            for line_no, line in enumerate(content.splitlines(), 1):
                bullet = re.fullmatch(r"[-*+](?:\s+(.*))?", line.strip())
                if not bullet:
                    continue
                target, reason = _parse_entry(bullet[1] or "")
                if not reason or not _valid_target(root, target):
                    invalid.append(line_no)
                    continue
                rows.append(f"- {target} — {reason}")
            if invalid:
                noun = "entry" if len(invalid) == 1 else "entries"
                lines = ", ".join(str(n) for n in invalid[:3])
                if len(invalid) > 3:
                    lines += ", …"
                notices.append(f"Skipped {len(invalid)} invalid catalog {noun}. See {INDEX} (lines {lines}).")
            if rows or partial:
                more = f"More entries: open {INDEX}"
        except (OSError, RuntimeError, UnicodeError, ValueError):
            notices.append(f"Could not read {INDEX}.")
    if not rows:
        rows = [f"- {path}" for path in spec_indexes if _valid_target(root, path)]
    full = "\n".join(rows + notices)
    if not partial and len(full) <= MAX_CHARS:
        return full
    notices.append(more)
    used = len("\n".join(notices))
    visible: list[str] = []
    for row in rows:
        used += len(row) + 1
        if used > MAX_CHARS:
            break
        visible.append(row)
    return "\n".join(visible + notices)


if __name__ == "__main__":
    print(knowledge_catalog(Path.cwd(), sys.stdin.read().splitlines()))
