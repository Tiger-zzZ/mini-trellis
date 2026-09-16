# Isolate Codex main-session active-task resolution

## Goal

Prevent a Codex main session from receiving or acting on another session's task
when its own identity or binding is unavailable. The source fix belongs to
Trellis; `castbox/guru-trellis#378` remains the downstream acceptance boundary.

## Requirements

- Main Codex hook paths must not infer ownership from session-file count.
- Missing identity or unmatched binding yields no task/context-required state;
  it never borrows a sibling task.
- Explicitly supported child entrypoints retain only their deliberate fallback;
  native Codex parent-bound injection remains strict.
- Independent checkout/session fixtures cannot cross-resolve active tasks.
- Context reads do not modify or clean up existing session files.
- Canonical templates and dogfood copies remain synchronized and are tested.

## Acceptance Criteria

- With zero, one, or multiple session files, a main Codex session without a
  matching identity never injects another task into SessionStart or workflow-state.
- Exact identity matches continue to resolve normally; stale matches do not
  select sibling sessions.
- Native child-agent behavior remains explicitly parent-bound and regression-tested.
- Two independent checkout fixtures cannot cross-resolve; session bytes and path
  sets are unchanged before and after read-only resolution.
- Canonical and installed/template runtime paths are covered by regression tests.
- No change is made to task/worktree creation, commit, push, PR, merge, release,
  or downstream Guru publication semantics.

## Out Of Scope

Issue #377 invocation contracts, whole session-model redesign, malicious-input
defense, stress races, TOCTOU, global current-task state, old-session cleanup,
and downstream Guru upgrade/publication.

## Blocking Decision

Resolve the #469 compatibility conflict: apply strict opt-in resolution to normal
Python/CLI callers as well as main hooks, preserving an unmatched old session
(recommended for full #378 compliance), or limit this task to main hooks and
retain ambient CLI fallback (smaller change but incomplete isolation).

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
