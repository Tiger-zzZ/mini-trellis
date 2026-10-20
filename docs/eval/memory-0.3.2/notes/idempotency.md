# Callback idempotency

Each accepted callback must include idempotency key `pay-key-current`.
A missing key is rejected before any charge is recorded.
