# 10 - Agent Environment Settings UI

## Summary

Add org settings UI for managing provisioned agent environments.

## Plan coverage

Owns plan lines:

- 857-900: org settings environment list, provisioned form, connected bridges/repos visibility, and status display
- 910-937: secret selector/reference UI for environment config
- 989-994: phase 7 org settings environment management and session-status display dependency
- 1066: V1 basic org settings UI requirement

## What needs to happen

- Add `Org Settings -> Agent Environments`.
- List provisioned environments with:
  - name
  - adapter type
  - default marker
  - enabled state
  - latest in-page test status/error
- Local environments are auto-created from connected desktop bridges; do not add manual local create/edit in V1.
- Show connected local bridges and registered repos in an operator-visible surface where available.
- Add create/edit flows for provisioned environments.
  - Show supported-tool compatibility fields when available.
- Add enable/disable.
- Add set default.
- Add test connection.
- Use shadcn/ui components and existing Tailwind tokens.
- Normalize GraphQL results into Zustand if shared across settings/session creation.

## Dependencies

- [02 - GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [03 - Agent Environment Service](03-agent-environment-service.md)

## Completion requirements

- [x] Admin can list provisioned org environments.
- [x] Local environments are service-managed and not manually editable in settings.
- [x] Connected local bridges and registered repos are visible in a ticket-10-owned or clearly linked operator surface.
- [x] Admin can create/edit provisioned environment.
- [x] Provisioned environment form can display/edit supported-tool compatibility constraints.
- [x] Admin can set an org default.
- [x] Admin can disable an environment.
- [x] Test connection shows success/error clearly.
- [x] UI uses generated GraphQL types and no duplicated enums.

## Implementation notes

- Keep forms utilitarian and dense; this is an operational settings surface.
- Do not expose raw secret values after save.
- Use a secret selector/reference for launcher auth secrets instead of plain text config where possible.
- Show bearer auth as the simple V1 option and HMAC only if that mode is implemented.
- The session row carries the deprovision lifecycle in `connection.state`:
  `stopping`, `stopped`, `deprovisioned`, `deprovision_failed` (in addition
  to the startup states from ticket 08). Session UI should distinguish
  "Trace is still cleaning up" (`stopping`/`deprovision_failed` with
  `autoRetryable: true`) from "Trace gave up" (`deprovision_failed` with
  `autoRetryable: false` and `abandonedAt` set) — only the latter requires
  operator action.

## How to test

1. Connect a local desktop bridge and verify local bridge/repo visibility in the chosen operator surface.
2. Open org settings and create a provisioned environment with mock URLs.
3. Set the provisioned environment as default and verify the list updates through environment events.
4. Disable the provisioned environment and verify it is unavailable for new sessions.
5. Run test connection and verify result handling.

## Review follow-ups

- [x] Use a tool-agnostic connected bridge source for the local environment form. The settings UI now reads connected local bridges through `myConnections`.
- [x] Reconcile default environment changes through service-layer events instead of client-side mutation-result upserts/refetches. Default-changing events now include all affected environments.
- [x] Add an org secret selector/listing flow for provisioned launcher auth when the API exposes secret metadata.
- [x] Reconcile the UI copy and implementation with the local-environment product decision: local environments are auto-created and hidden from Agent Environments, but bridge/repo visibility still needs to be discoverable outside the provisioned-only list.
- [x] Add persisted or queryable last status/error fields, or explicitly scope the list requirement to the latest in-dialog test result.
