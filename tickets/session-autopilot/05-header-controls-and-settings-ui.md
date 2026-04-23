# 05 — Header Controls and Settings UI

## Summary

Add the user-facing controls for Session Autopilot in the session experience: button, state chip, and settings popover.

## What needs to happen

- Add an `Autopilot` button to the session header.
- Add a state chip with the supported statuses.
- Build a settings popover or compact dialog with:
  - enabled toggle
  - controller tool picker
  - controller model picker
  - controller hosting/runtime picker
  - playbook selector
  - custom instructions
  - `Run now`
  - `Pause`
  - `Disable`
- Wire the UI to the Autopilot GraphQL operations.
- Use optimistic UI sparingly; final state should come back through events.

## Dependencies

- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [04 — Autopilot Service CRUD and State](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [ ] Session header shows an Autopilot affordance.
- [ ] State chip reflects live Autopilot status.
- [ ] User can enable, disable, pause, and run-now from the UI.
- [ ] Tool/model/runtime selection persists through the service layer.
- [ ] UI survives missing Autopilot state cleanly.

## Implementation notes

- Keep the initial surface compact. Do not build a large management console in v1.
- Reuse existing session tool/model/runtime patterns where possible so the Autopilot settings feel native to Trace.

## How to test

1. Open a session with no Autopilot state and verify the header renders cleanly.
2. Enable Autopilot and verify state changes to `waiting`.
3. Change controller tool/model/runtime and verify the persisted state updates.
4. Run now, pause, and disable from the UI.

