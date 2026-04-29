# 10 - Agent Environment Settings UI

## Summary

Add org settings UI for managing local and provisioned agent environments.

## What needs to happen

- Add `Org Settings -> Agent Environments`.
- List environments with:
  - name
  - adapter type
  - default marker
  - enabled state
  - last status/error if available
- Add create/edit flows for local environments.
- Add create/edit flows for provisioned environments.
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
- [ ] Admin can create/edit provisioned environment.
- [ ] Admin can set an org default.
- [ ] Admin can disable an environment.
- [ ] Test connection shows success/error clearly.
- [ ] UI uses generated GraphQL types and no duplicated enums.

## Implementation notes

- Keep forms utilitarian and dense; this is an operational settings surface.
- Do not expose raw secret values after save.
- Use a secret selector/reference for signing secrets instead of plain text config where possible.

## How to test

1. Open org settings and create a local environment.
2. Create a provisioned environment with mock URLs.
3. Set each as default and verify list updates.
4. Disable an environment and verify it is unavailable for new sessions.
5. Run test connection and verify result handling.
