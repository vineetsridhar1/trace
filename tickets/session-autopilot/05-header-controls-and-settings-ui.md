# 05 — Group Controls and Ultraplan UI

## Summary

Move the product surface from a single session header to the session-group UI and add the first Ultraplan status/control panel.

## What needs to happen

- Add an `Ultraplan` button or menu to the session group header.
- Add a state chip with the supported Ultraplan statuses.
- Build a compact group-level panel showing:
  - plan summary
  - current status
  - controller session state
  - ticket executions
  - worker sessions
  - branch names
  - active human gate
  - final branch/PR link
- Add controls for:
  - start
  - pause
  - resume
  - run controller now
  - cancel
- Wire controls to GraphQL operations.
- Use events as the source of truth for final UI state.

## Dependencies

- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [04 — Ultraplan Service CRUD and State](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [ ] Session group header shows an Ultraplan affordance.
- [ ] State chip reflects live Ultraplan status.
- [ ] User can start, pause, resume, cancel, and run-now from the group surface.
- [ ] Ticket worker sessions are linked from the panel.
- [ ] Controller session is not shown in normal tabs, but can be inspected from an explicit debug entry if available.
- [ ] UI survives missing Ultraplan state cleanly.

## Implementation notes

- Keep the initial panel practical and dense. Do not build a large management console in v1.
- Use shadcn/ui components and existing session UI patterns.
- Product copy should describe the workflow, not implementation details.

## How to test

1. Open a session group with no Ultraplan and verify the empty/start state.
2. Start Ultraplan and verify event-driven status updates.
3. Pause/resume/run-now/cancel and verify the chip and panel update.
4. Verify the UI does not expose controller sessions in normal navigation.
