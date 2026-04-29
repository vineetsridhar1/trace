# 05 — Group Controls and Ultraplan UI

## Summary

Move the product surface to the session-group UI and add the first Ultraplan status/control panel, including the controller run summary timeline.

## What needs to happen

- Add an `Ultraplan` button or menu to the session group header.
- Add a state chip with the supported Ultraplan statuses.
- Build a compact group-level panel showing:
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
- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [x] Session group header shows an Ultraplan affordance.
- [x] State chip reflects live Ultraplan status.
- [x] User can start, pause, resume, cancel, and run-now from the group surface.
- [ ] Ordered tickets and their dependency/blocking state are visible. Ticket order and
  `UltraplanTicket.status` render, but dependency edges/blocking reasons are not yet surfaced.
- [x] Planned tickets render before any `TicketExecution` exists.
- [x] Ticket worker sessions are linked from the panel.
- [x] Controller run summaries render in an activity timeline.
- [x] User can open the full chat for a controller run from the timeline.
- [x] Controller-run sessions are not shown in normal tabs.
- [x] UI survives missing Ultraplan state cleanly.

## Implementation notes

- Keep the initial panel practical and dense. Do not build a large management console in v1.
- Use shadcn/ui components and existing session UI patterns.
- Product copy should describe the workflow, not implementation details.

## Review follow-ups

- Render dependency edges/blocking reasons in the ticket plan.
- Render controller summary action labels from the planned `summaryPayload.actions[].label`
  shape, not only `title` or `summary` fields.

## How to test

1. Open a session group with no Ultraplan and verify the empty/start state.
2. Start Ultraplan and verify event-driven status updates.
3. Pause/resume/run-now/cancel and verify the chip and panel update.
4. Verify the ordered plan shows the active ticket and blocked future tickets.
5. Verify planned tickets without executions still appear in the plan.
6. Verify controller run summaries appear and link to full chats.
7. Verify the UI does not expose controller-run sessions in normal navigation.
