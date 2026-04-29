# 03 — Session Roles and Visibility

## Summary

Add role-aware session behavior so Ultraplan controller sessions are hidden from normal product surfaces while ticket worker sessions remain visible with clear metadata.

## What needs to happen

- Update session queries and list helpers so `ultraplan_controller` sessions are excluded by default.
- Ensure session-group status derivation ignores controller sessions.
- Ensure group tab strips and active-session navigation ignore controller sessions unless an explicit debug surface asks for them.
- Keep `ticket_worker` sessions visible in normal group surfaces.
- Add UI/client-facing metadata so worker sessions can show linked ticket and branch context.
- Keep controller sessions available to Ultraplan services via explicit lookups.
- Audit move/rehydration flows so controller sessions do not become the active visible session.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)

## Completion requirements

- [ ] Controller sessions never appear in normal session tables.
- [ ] Controller sessions never appear in normal session group tab strips.
- [ ] Group status ignores controller sessions.
- [ ] Worker sessions remain visible and navigable.
- [ ] Existing session UX remains unchanged when Ultraplan is not active.

## Implementation notes

- Hidden is a product concern, not a security boundary. Services can still fetch controller sessions directly.
- Do not hide ticket worker sessions; they are part of the user's observable workflow.
- Keep role filtering centralized so future session lists do not accidentally expose controller sessions.

## How to test

1. Create primary, ticket-worker, and controller sessions in one group.
2. Verify normal group/session lists include primary and worker sessions only.
3. Verify explicit service lookups can fetch the controller.
4. Verify group status does not become active just because the controller is running.
