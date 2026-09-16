# Technical Design

## Boundary
Make active-task fallback explicit at each caller. Main Codex/session/workflow paths pass `allow_single_session_fallback=False`; only documented pull-based child-agent paths may opt in. Keep resolver capability backward-compatible for deliberate callers.

## Compatibility
`task.py finish` must not delete a fallback session when the current identity did not match it. Cleanup remains limited to the resolved context key. Existing #469 exact-match cleanup remains supported; its fallback cleanup assertion is replaced by strict isolation behavior.

## Validation
Add regression cases for Codex main hooks and CLI current/finish with zero, one, multiple, unmatched, stale, and exact session identities. Preserve canonical/template parity and run focused Vitest plus Python hook checks.
