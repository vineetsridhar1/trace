# 03 — Session Role and Visible Filtering

## Summary

Introduce controller sessions without polluting normal product surfaces. The hidden controller must reuse the session stack under the hood while staying out of the user-visible session lists, tab strips, and status derivation.

## What needs to happen

- Update session queries and list helpers so controller sessions are excluded by default.
- Ensure session-group status derivation ignores controller sessions.
- Ensure group tab strips and active-session navigation ignore controller sessions.
- Keep controller sessions available to the Autopilot service via explicit lookups.
- Audit move/rehydration flows so the active worker session remains the user-visible one.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)

## Completion requirements

- [ ] Controller sessions never appear in normal session tables.
- [ ] Controller sessions never appear in normal session group tab strips.
- [ ] Group status ignores controller sessions.
- [ ] Existing session UX remains unchanged when Autopilot is disabled.

## Implementation notes

- This ticket is a prerequisite for creating controller sessions safely.
- Keep "hidden" as a product concern, not a security boundary. Services can still fetch controller sessions directly.

## How to test

1. Create one primary session and one controller session in the same group.
2. Verify session lists show only the primary one.
3. Verify group status derives from the primary session only.
4. Verify direct service lookup can still fetch the controller session.
