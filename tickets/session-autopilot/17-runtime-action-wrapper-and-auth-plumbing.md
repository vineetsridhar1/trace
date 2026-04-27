# 17 — Runtime Action Wrapper and Auth Plumbing

## Summary

Post-v1 follow-up work: let external coding tools like Codex and Claude Code trigger a bounded set of Trace actions through a bundled wrapper/CLI backed by short-lived runtime tokens.

## What needs to happen

- Define a narrow service-backed API surface for runtime-issued actions.
- Mint short-lived `TRACE_RUNTIME_TOKEN` credentials with scoped claims:
  - organization id
  - session or session-group scope
  - allowed action set
  - short expiry
- Inject `TRACE_API_URL` and `TRACE_RUNTIME_TOKEN` into local and cloud coding-tool launches.
- Extend the local bridge / adapter launch path to support per-run env injection.
- Bundle a `trace-agent` wrapper or equivalent on `PATH` for desktop and cloud runtimes.
- Make the wrapper read env, attach auth headers, call the service-backed API, and print machine-readable results.
- Keep all mutations flowing through the normal service layer and event model.

## Dependencies

- [15 — Telemetry, Error States, and Polish](15-telemetry-error-states-and-polish.md)
- [16 — Playbook Expansion and Debug Follow-ups](16-playbook-expansion-and-debug-followups.md)

## Completion requirements

- [ ] Short-lived runtime tokens can be minted and verified with scoped claims.
- [ ] Local and cloud coding-tool launches can inject per-run Trace runtime env.
- [ ] The wrapper is available on `PATH` in supported runtimes.
- [ ] At least one bounded action path works end-to-end through the wrapper.
- [ ] Expired, wrong-org, or wrong-scope tokens fail closed.
- [ ] No direct event creation or direct DB writes are exposed to the wrapper.

## Implementation notes

- Keep this explicitly out of the smallest Autopilot v1 loop. The v1 controller should still emit bounded XML decisions and let the server apply them.
- Prefer a wrapper/CLI over raw `curl` so the model does not need to hand-roll auth headers.
- Do not inject long-lived user API keys into the coding-tool process for this feature.
- Prefer per-run token rotation when practical; if a longer-lived token is used initially, keep TTL short and claims narrow.

## How to test

1. Launch a local runtime with wrapper support and verify the wrapper can read `TRACE_API_URL` and `TRACE_RUNTIME_TOKEN`.
2. Trigger a bounded action through the wrapper and verify the normal service layer emits the expected event.
3. Repeat the same test on a cloud runtime.
4. Verify expired-token, wrong-org, and wrong-scope cases fail safely with clear errors.
