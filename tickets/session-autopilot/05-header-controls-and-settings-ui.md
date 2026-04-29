# 05 — Group Controls and Ultraplan UI

## Summary

Move the product start surface into the normal session composer and add the first session-group Ultraplan status surface. The user selects Ultraplan from the mode pill and submits the goal through the normal input, then the group UI shows enough event-driven Ultraplan state to make the background controller run observable.

## What needs to happen

- Add `Ultraplan` to the composer mode pill.
- When the composer is in Ultraplan mode, submit the normal input text as the Ultraplan goal.
- Remove the separate header start panel and optional-instructions form.
- Wire the composer submit path to `startUltraplan`.
- Add group-level Ultraplan status/readout surface showing:
  - plan summary
  - current status
  - ordered ticket plan
  - planned tickets before execution
  - ticket executions
  - worker sessions
  - branch names
  - active human gate
  - final branch/PR link
  - controller run summaries
- Add controller activity timeline rows with:
  - summary title
  - short summary
  - actions/decisions when available
  - timestamp/status
  - link to full controller run chat
- Add controls for pause, resume, run controller now, and cancel once Ultraplan exists.
- Use events as the source of truth for final UI state.

## Dependencies

- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)
- [06 — Client Store and Event Handling](06-client-store-and-event-handling.md) for event-driven status, timeline, and planned-ticket hydration

## Completion requirements

- [x] Composer mode pill includes Ultraplan.
- [x] Ultraplan mode starts Ultraplan with the normal composer text as the goal.
- [x] Header no longer includes a separate Ultraplan start affordance.
- [x] There is no separate optional-instructions field in the start flow.
- [x] Composer submit path wires to `startUltraplan`.
- [x] State/readout surface reflects live Ultraplan status after the success toast.
- [x] Pause, resume, cancel, and run-now controls are available from the group surface.
- [ ] Ordered tickets and their dependency/blocking state are visible.
- [ ] Planned tickets render before any `TicketExecution` exists.
- [ ] Ticket worker sessions are linked from the Ultraplan surface.
- [ ] Controller run summaries render in an activity timeline.
- [ ] User can open the full chat for a controller run from the timeline.
- [x] Controller-run sessions remain hidden in normal tabs.
- [x] UI survives missing Ultraplan state cleanly.

## Implementation notes

- Keep the initial start flow practical and dense. Do not build a large management console in v1.
- Use shadcn/ui components and existing session UI patterns.
- Product copy should describe the workflow, not implementation details.

## How to test

1. Open a not-started session and verify the mode pill cycles to Ultraplan.
2. Enter a goal in the normal composer while in Ultraplan mode.
3. Submit and verify `startUltraplan` is called with that goal.
4. Verify the composer restores the draft if `startUltraplan` fails.
5. Verify the session group header does not show a separate Ultraplan start control.
6. After `startUltraplan` succeeds, verify visible group-level Ultraplan state changes without manually opening an internal controller-run session.
7. Verify pause/resume/run-now/cancel update the visible state through events.
8. Verify planned tickets, ticket executions, worker links, and controller run summaries render from store/event state.
9. Verify controller-run sessions do not appear in normal session tab strips, but are reachable from controller activity/debug links.
