# 01 — Database Schema and Event Types

## Summary

Add the durable database shape for Session Autopilot: new enums, the new `SessionAutopilot` model, the controller-session role, and the event/inbox enum values the rest of the system will build on.

## What needs to happen

- Add Prisma enums:
  - `SessionRole`
  - `SessionAutopilotStatus`
  - `AutopilotDecisionAction`
- Add `role SessionRole @default(primary)` to `Session`.
- Add a new `SessionAutopilot` model with:
  - org ownership
  - one-to-one relation to `SessionGroup`
  - owner user id
  - controller tool/model/hosting/runtime config
  - controller session id
  - active worker session id
  - status and enablement
  - last checkpoint sha
  - last decision summary
  - last human inbox item id
  - consecutive auto turns
- Extend Prisma `EventType` with the Autopilot event family.
- Extend Prisma `InboxItemType` with `autopilot_validation_request`.
- Run migration and Prisma generate.

## Dependencies

- None

## Completion requirements

- [ ] Schema compiles with the new enums and model.
- [ ] Existing sessions default to `role = primary`.
- [ ] `SessionAutopilot` is one-to-one with `SessionGroup`.
- [ ] New event types exist in Prisma.
- [ ] New inbox item type exists in Prisma.
- [ ] Migration runs cleanly on an existing local database.

## Implementation notes

- Keep `SessionAutopilot` first-class rather than hiding JSON inside `SessionGroup`.
- Do not add speculative fields for post-v1 playbooks or mobile state.
- Use nullable foreign-key style string fields for controller session id and active session id in v1; stronger relational wiring can come later if needed.

## How to test

1. Run `pnpm db:migrate`.
2. Run `pnpm db:generate`.
3. Inspect the generated Prisma client for the new enums and model.
4. Create a session manually and verify `role` defaults to `primary`.
