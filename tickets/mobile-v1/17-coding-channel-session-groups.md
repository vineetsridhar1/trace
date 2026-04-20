# 17 — Coding Channel: Session Groups List

## Summary

The coding channel detail screen — the user's landing page when drilling into a channel. Shows session groups segmented by Active / Merged / Archived, with live-updating rows displaying name, status, branch, last activity, and a one-line preview.

## What needs to happen

- `app/(authed)/channels/[id].tsx` (<200 lines — extract row renderer, header component into separate files as needed):
  - Reads `channelId` from route params.
  - On mount: query `sessionGroups(channelId, archived: false)`. On "Archived" segment tap: query `sessionGroups(channelId, archived: true)`.
  - Subscribes (mounts) to `sessionEvents` scope not needed here — ambient `orgEvents` suffices; this view just filters entity store.
- Header (in `SessionGroupsHeader.tsx`):
  - Channel name, subtitle computed from store ("N active · M needs input"), Liquid Glass background
  - Segmented control: `Active | Merged | Archived`
- Row component (`SessionGroupRow.tsx`):
  - Uses `Card` (or tightly-spaced `ListRow`) — name bold, status chip to the right, branch monospace subtitle, last-event preview truncated, relative timestamp
  - Pulls fields via `useEntityField('sessionGroups', id, 'name')`, etc.
  - Tap → navigate to `/sessions/[groupId]`
  - Long-press → native context menu: "Archive workspace" (if not archived) → `archiveSessionGroup` mutation, "Copy link" → `Clipboard.setStringAsync('trace://sessions/' + id)`
- **Status-to-chip mapping**: session-group statuses in the data contract (`in_progress, needs_input, in_review, merged, failed`) map to `Chip` variants by camelCasing: `in_progress → "inProgress"`, `needs_input → "needsInput"`, `in_review → "inReview"`, `merged → "merged"`, `failed → "failed"`. Centralize this translation in `SessionGroupRow.tsx` (or a tiny helper) so subsequent tickets don't duplicate it.
- `FlashList` virtualized list of rows, sorted by `_sortTimestamp` desc.
- Empty state per segment: "No active sessions in this channel" / "Nothing merged yet" / "Nothing archived".
- Live updates: entity store updates from ambient subscription; list reacts via Zustand selector.
- Pull-to-refresh should call `refreshOrgData(orgId)` from `apps/mobile/src/hooks/useHydrate.ts` (shared helper added in ticket 16) plus a focused `sessionGroups(channelId, archived)` refetch for the current segment.

## Dependencies

- [16 — Channels List](16-channels-list-screen.md)
- [13 — Data Primitives (Chip, Card)](13-data-primitives.md)

## Completion requirements

- [ ] Session groups list renders correctly with status chips
- [ ] Segmented filter switches between active / merged / archived
- [ ] Archived segment loads archived groups via separate query
- [ ] Status chip colors match plan (§11.2)
- [ ] Long-press archives via mutation → optimistic removal on ambient event
- [ ] All files <200 lines

## How to test

1. Open a coding channel with multiple session groups in different states.
2. Active → see in_progress and needs_input groups.
3. Switch to Merged → see merged groups.
4. Long-press → context menu → Archive → group moves out of Active segment after ~1s (when archive event arrives via subscription).
5. Trigger a status change on web; mobile row updates live.
