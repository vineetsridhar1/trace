# 17 — Runtime Action Wrapper and Auth Plumbing

## Summary

Add v1 infrastructure that lets controller-run sessions perform actions through scoped executables that call Trace server APIs. This replaces the brittle action-batch-output approach.

## What needs to happen

- Define a narrow service-backed API surface for runtime-issued actions.
- Mint short-lived `TRACE_RUNTIME_TOKEN` credentials with scoped claims:
  - organization id
  - Ultraplan id
  - session group id
  - controller run id
  - controller-run session id
  - allowed action names
  - expiry
- Inject controller-run environment:
  - `TRACE_API_URL`
  - `TRACE_RUNTIME_TOKEN`
  - `TRACE_ULTRAPLAN_ID`
  - `TRACE_CONTROLLER_RUN_ID`
- Extend local and cloud coding-tool launch paths to support per-run env injection.
- Bundle a `trace-agent` wrapper or equivalent on `PATH` for controller-run runtimes.
- Make the wrapper read env, attach auth headers, call the service-backed API, and print machine-readable results.
- Add a controller-run skill/instructions file that teaches the agent:
  - available commands
  - JSON input shape
  - expected output shape
  - when to call each action
  - that the final structured response is for summary only
- Keep all mutations flowing through the normal service layer and event model.

## Dependencies

- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [ ] Short-lived runtime tokens can be minted and verified with scoped claims.
- [ ] Local and cloud controller-run launches can inject per-run Trace runtime env.
- [ ] The wrapper is available on `PATH` in supported controller-run runtimes.
- [ ] Controller-run prompt includes the action skill/instructions.
- [ ] At least one bounded action path works end-to-end through the wrapper.
- [ ] Expired, wrong-org, wrong-Ultraplan, wrong-run, or wrong-scope tokens fail closed.
- [ ] No direct event creation or direct DB writes are exposed to the wrapper.

## Implementation notes

- This is v1 infrastructure for controller runs, not a post-v1 enhancement.
- Prefer a wrapper/CLI over raw `curl` so the model does not hand-roll auth headers.
- Do not inject long-lived user API keys into coding-tool processes.
- Prefer per-run token rotation. Token claims should be narrow enough that leaked credentials cannot act outside the current controller run.
- The same service dispatcher should back both wrapper calls and any future native tool-calling integration.

## How to test

1. Mint a scoped token for a controller run session.
2. Launch a controller-run session with the expected env variables.
3. Call one allowed wrapper action and verify service/events.
4. Attempt a disallowed action and verify failure.
5. Attempt wrong-org, wrong-Ultraplan, wrong-run, and expired-token calls and verify fail-closed behavior.
6. Verify no wrapper path can write events directly.
