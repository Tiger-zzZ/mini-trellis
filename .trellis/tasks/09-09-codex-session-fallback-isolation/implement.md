# Implementation Plan

1. Update the canonical active-task resolver callers and mirrored dogfood templates with explicit fallback policy.
2. Ensure `clear_active_task` only removes the resolved context key and never an inferred sibling.
3. Update regression tests to cover zero/one/multiple/unmatched/stale/exact identities and unchanged session files.
4. Run parity, focused regression, Python syntax, lint/typecheck, and relevant CLI tests.
5. Review diff and remaining upstream/downstream acceptance boundaries.
