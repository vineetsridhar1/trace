# 25 — Home Screen with Three Sections

## Summary

The Home tab — the user's daily driver. A single scrollable feed with three sections: sessions that need input, sessions currently working, and recently-done sessions from the last 24h. Live-updating via the ambient subscription. Pull-to-refresh. Tap → session stream.

## What needs to happen

- `app/(authed)/index.tsx` (<200 lines — extract section renderer and row into separate files):
  - Hydrate via `mySessions(organizationId)` on mount.
  - Reads from entity store with a selector hook `useHomeSections(userId)`:
    - **Needs you**: `sessions.filter(s => s.sessionStatus === 'needs_input' && s.createdBy.id === userId)` sorted by most recent pending event (question_pending first, then plan_pending).
    - **Working now**: `s.agentStatus === 'active' && s.createdBy.id === userId` sorted by `_sortTimestamp` desc.
    - **Recently done**: `(s.agentStatus === 'done' || s.sessionStatus === 'in_review') && s.updatedAt within 24h && s.createdBy.id === userId` sorted desc.
  - Renders via `FlashList` with section headers (`stickyHeaderIndices`).
- `HomeSessionRow.tsx` (<200 lines):
  - `Card` with padding; status chip, session name, branch (mono), channel subtitle, last-event preview one-line, relative timestamp.
  - Tap → navigate to `/sessions/[groupId]/[sessionId]`, with haptic `light`.
  - Long-press → native context menu: "Open PR" (if prUrl), "Stop session" (if active), "Copy link".
  - Status-dot pulses if active.
- `HomeSectionHeader.tsx` (<100 lines):
  - Sticky header with section title + count badge.
  - Liquid Glass pinned variant.
- Empty state: all sections empty → centered `EmptyState` — icon `checkmark.seal`, title "All clear", subtitle "Sessions that need you will show up here."
- Pull-to-refresh: refetches `mySessions`.
- Live updates: entity store updates from ambient `orgEvents` → list reorders via Reanimated layout animations on `FlashList` cells.

## Dependencies

- [09 — Post-auth Hydration](09-sign-in-flow-and-hydration.md)
- [15 — Navigation Skeleton](15-navigation-tabs.md)
- [13 — Data Primitives](13-data-primitives.md)

## Completion requirements

- [ ] Three sections render with correct filtering
- [ ] Sort within each section respects `_sortTimestamp` and pending-event recency
- [ ] Live updates reorder the list without flicker
- [ ] Empty state shows when all sections empty
- [ ] Tap navigates correctly (deep into session stream)
- [ ] Pull-to-refresh re-hydrates
- [ ] All files <200 lines

## How to test

1. Sign in with a user who has sessions in various states. Verify all three sections populate correctly.
2. Trigger a question_pending on web — mobile Home row moves to top of "Needs you".
3. Trigger a new active session — appears in "Working now".
4. Mark session done — moves to "Recently done".
5. Pull to refresh — no duplicates; list reconciles.
6. Tap row → lands on session stream.
