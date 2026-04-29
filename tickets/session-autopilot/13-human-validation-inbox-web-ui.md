# 13 — Human Gate Inbox UI

## Summary

Render Ultraplan human gates in the web inbox with clear context and explicit actions.

## What needs to happen

- Add Ultraplan gate handling to `InboxItemRow`.
- Create dedicated gate body components as needed for:
  - plan approval
  - ticket validation
  - conflict resolution
  - final review
- Render:
  - short title
  - summary
  - QA checklist or decision checklist
  - linked ticket
  - linked worker session
  - branch/checkpoint metadata
  - open session/group actions
  - open PR/diff action when available
  - approve/request changes/dismiss actions
- Make the UX feel like a focused workflow gate, not a generic alert.

## Dependencies

- [06 — Client Store and Event Handling](06-client-store-and-event-handling.md)
- [12 — Human Gates Server Flow](12-human-validation-handoff-server.md)

## Completion requirements

- [ ] Ultraplan gate items render with dedicated bodies.
- [ ] Checklist items display clearly.
- [ ] Session, group, ticket, and PR actions work when present.
- [ ] Gate resolution actions call the appropriate mutation/service path.
- [ ] The row does not fall through to plan/question/suggestion rendering.

## Implementation notes

- Reuse existing inbox styling patterns.
- Keep button labels explicit.
- Do not describe internal controller mechanics in user-facing copy.

## How to test

1. Render each Ultraplan inbox item type.
2. Verify missing optional links degrade cleanly.
3. Resolve an approval gate and verify UI state updates from events.
4. Request changes from a validation gate and verify payload is preserved.
