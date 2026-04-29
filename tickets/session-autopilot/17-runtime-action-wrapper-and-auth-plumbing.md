# 17 — Runtime Action Wrapper and Auth Plumbing

## Summary

Post-v1 follow-up for giving controller-run and worker runtimes a narrow authenticated wrapper for service-backed Trace actions when direct tool integration is not enough.

## What needs to happen

- Define a narrow service-backed API surface for runtime-issued actions.
- Mint short-lived `TRACE_RUNTIME_TOKEN` credentials with scoped claims:
  - organization id
  - session group id
  - controller run id or worker session id
  - Ultraplan id
  - controller-run session id or worker session id
  - allowed action names
  - expiry
- Inject `TRACE_API_URL` and `TRACE_RUNTIME_TOKEN` into local and cloud coding-tool launches.
- Extend local bridge and adapter launch paths to support per-run env injection.
- Bundle a `trace-agent` wrapper or equivalent on `PATH` for desktop and cloud runtimes.
- Make the wrapper read env, attach auth headers, call the service-backed API, and print machine-readable results.
- Keep all mutations flowing through the normal service layer and event model.

## Dependencies

- [15 — Integration, Telemetry, and Polish](15-telemetry-error-states-and-polish.md)
- [16 — Controller Debugging and Playbook Expansion](16-playbook-expansion-and-debug-followups.md)

## Completion requirements

- [ ] Short-lived runtime tokens can be minted and verified with scoped claims.
- [ ] Local and cloud coding-tool launches can inject per-run Trace runtime env.
- [ ] The wrapper is available on `PATH` in supported runtimes.
- [ ] At least one bounded action path works end-to-end through the wrapper.
- [ ] Expired, wrong-org, or wrong-scope tokens fail closed.
- [ ] No direct event creation or direct DB writes are exposed to the wrapper.

## Implementation notes

- Keep this out of the smallest Ultraplan v1 loop unless needed for controller tooling.
- Prefer a wrapper/CLI over raw `curl` so the model does not hand-roll auth headers.
- Do not inject long-lived user API keys into coding-tool processes.
- Prefer per-run token rotation when practical; if a longer-lived token is used initially, keep TTL short and claims narrow.

## How to test

1. Mint a scoped token for a controller run session.
2. Call one allowed wrapper action and verify service/events.
3. Attempt a disallowed action and verify failure.
4. Attempt wrong-org and expired-token calls and verify fail-closed behavior.
5. Verify no wrapper path can write events directly.
