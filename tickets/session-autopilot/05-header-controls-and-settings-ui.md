# 05 — Group Controls and Ultraplan UI

## Summary

Move the product start surface into the normal session composer by adding Ultraplan as an interaction mode. The user selects Ultraplan from the mode pill and submits the goal through the normal input.

## What needs to happen

- Add `Ultraplan` to the composer mode pill.
- When the composer is in Ultraplan mode, submit the normal input text as the Ultraplan goal.
- Remove the separate header start panel and optional-instructions form.
- Wire the composer submit path to `startUltraplan`.
- Use events as the source of truth for final UI state.

## Dependencies

- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [x] Composer mode pill includes Ultraplan.
- [x] Ultraplan mode starts Ultraplan with the normal composer text as the goal.
- [x] Header no longer includes a separate Ultraplan start affordance.
- [x] There is no separate optional-instructions field in the start flow.
- [x] Composer submit path wires to `startUltraplan`.
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
