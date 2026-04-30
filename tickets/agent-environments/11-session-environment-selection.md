# 11 - Session Environment Selection

## Summary

Let session creation use an explicit environment or the org default while preserving current local behavior.

## Plan coverage

Owns plan lines:

- 164-190: persist environment/runtime metadata in session connection state
- 341-362: session creation environment resolution, admission checks, and `hosting` compatibility
- 901-909: session environment selector and advanced environment choice
- 957-964: phase 3 session creation behavior
- 991-994: phase 7 session selector and startup/deprovision status
- 1052-1062: transition from open decisions into V1 `environmentId`, default environment, and admission requirements
- 1066: session-side portion of the basic UI requirement

## What needs to happen

- Add environment selector to session creation surfaces.
- Default to the org default environment.
- Allow advanced users to choose another enabled environment.
- Keep existing local runtime picker behavior where needed, but map it to local environment selection.
- Update `SessionService` to resolve:
  - explicit `environmentId`
  - org default environment
  - compatibility fallback using `hosting` and `runtimeInstanceId`
- Return a clear validation error when no environment/default/compatibility fallback can be resolved.
- Enforce V1 environment compatibility constraints before provisioning:
  - enabled state
  - supported tool
- Persist `environmentId` and adapter metadata in session connection.
- Show startup/provisioning status for provisioned sessions.
- Show deprovision/stopping status in the session UI when a runtime is being cleaned up.

## Dependencies

- [05 - Local Environment Adapter](05-local-environment-adapter.md)
- [06 - Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)
- [10 - Agent Environment Settings UI](10-agent-environment-settings-ui.md)

## Completion requirements

- [x] Starting a session with explicit local environment works.
- [x] Starting a session with explicit provisioned environment works against a mock launcher.
- [x] Omitting environment uses org default.
- [x] Missing environment/default/fallback produces an actionable validation error.
- [x] Unsupported tool requests fail before provisioning.
- [x] Existing callers using `hosting` still work during migration.
- [x] Disabled environments cannot be selected.
- [x] Session UI shows startup state for provisioned sessions.
- [x] Session UI shows stopping/deprovision status when relevant.

## Implementation notes

- Components should pass IDs, not full environment objects.
- Keep mutation result usage fire-and-forget; events should update stores.
- Avoid making local sessions feel different in the common case.

## How to test

1. Create a default local environment and start a session without selecting an environment.
2. Create a provisioned environment and start a session explicitly against it.
3. Disable the provisioned environment and verify session creation rejects it.
4. Start a session through old `hosting` input and verify compatibility.

## Review follow-ups

- [x] Reject or normalize requests that provide both `environmentId` and a conflicting `runtimeInstanceId`; explicit environment selection should remain the source of truth.
- [x] Make the session creation repo-link precheck validate the selected local environment's bound runtime, not just any connected local runtime.
