# 10 - Agent Environment Settings UI

## Summary

Add org settings UI for managing local and provisioned agent environments.

## Plan coverage

Owns plan lines:

- 857-900: org settings environment list, local form, provisioned form, connected bridges/repos, and status display
- 910-937: secret selector/reference UI for environment config
- 989-994: phase 7 org settings environment management and session-status display dependency
- 1066: V1 basic org settings UI requirement

## What needs to happen

- Add `Org Settings -> Agent Environments`.
- List environments with:
  - name
  - adapter type
  - default marker
  - enabled state
  - last status/error if available
- Add create/edit flows for local environments.
  - Show connected local bridges.
  - Show registered repos for each local bridge where available.
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

- [ ] Admin can list org environments.
- [ ] Admin can create/edit local environment.
- [ ] Local environment form shows connected local bridges and registered repos.
- [ ] Admin can create/edit provisioned environment.
- [ ] Provisioned environment form can display/edit supported-tool compatibility constraints.
- [ ] Admin can set an org default.
- [ ] Admin can disable an environment.
- [ ] Test connection shows success/error clearly.
- [ ] UI uses generated GraphQL types and no duplicated enums.

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

1. Open org settings and create a local environment.
2. Create a provisioned environment with mock URLs.
3. Set each as default and verify list updates.
4. Disable an environment and verify it is unavailable for new sessions.
5. Run test connection and verify result handling.
