# Workspace Index

Per-developer journals live under `.trellis/workspace/<name>/`.

## Active Developers

| Developer | Last Active | Sessions | Active File |
|-----------|-------------|----------|-------------|
| (none yet) | - | - | - |

## Getting Started

```bash
python3 ./.trellis/scripts/init_developer.py <your-name>
```

Record a session:

```bash
python3 ./.trellis/scripts/add_session.py --title "Short title" --commit - --summary "..."
```

Journals rotate at 2000 lines (`journal-N.md`).
