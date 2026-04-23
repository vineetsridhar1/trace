# 13 — Human Validation Inbox UI

## Summary

Render Autopilot validation requests as a dedicated inbox surface on web. This is the human side of the feature.

## What needs to happen

- Add `autopilot_validation_request` handling to `InboxItemRow`.
- Create a dedicated `InboxAutopilotValidationBody` component.
- Render:
  - title
  - summary
  - QA checklist
  - open session action
  - open PR action when present
  - pause Autopilot action
- Make the UX feel like a review request, not a generic alert.

## Dependencies

- [06 — Client Store and Event Handling](06-client-store-and-event-handling.md)
- [12 — Human Validation Handoff (Server)](12-human-validation-handoff-server.md)

## Completion requirements

- [ ] Validation inbox items render with their own body.
- [ ] Checklist items display clearly.
- [ ] Session and PR actions work.
- [ ] The row does not fall through to plan/question/suggestion rendering.

## Implementation notes

- Reuse existing inbox styling patterns where possible.
- Do not bundle pause/disable semantics into unclear button copy; keep actions explicit.

## How to test

1. Load an active `autopilot_validation_request` item.
2. Verify correct rendering and action buttons.
3. Open session and PR from the item.
4. Confirm non-Autopilot inbox items still render unchanged.

