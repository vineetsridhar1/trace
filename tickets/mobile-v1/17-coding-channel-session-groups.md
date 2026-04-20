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

- [x] Session groups list renders correctly with status chips
- [x] Segmented filter switches between active / merged / archived
- [x] Archived segment loads archived groups via separate query
- [x] Status chip colors match plan (§11.2)
- [x] Long-press archives via mutation → optimistic removal on ambient event
- [x] All files <200 lines

## Implementation notes (landed)

- **Stable-ID selector**: `useChannelSessionGroupIds(channelId, segment)` (in `apps/mobile/src/hooks/useChannelSessionGroups.ts`) returns a sorted `string[]` of group IDs and uses `useShallow` so the FlashList only re-renders when the visible set changes. Same primitive-key pattern that ticket 16 settled on for channels.
- **Segment → server query**: `active` queries with `archived: false`, `merged` queries with `archived: false, status: "merged"`, `archived` queries with `archived: true`. The `active` segment additionally filters out `merged` client-side from the store so it doesn't show stale merged groups that the user already moved past. Only the active segment fetches on first mount; switching tabs triggers a focused refetch for that segment.
- **Status → chip mapping** is centralized in `apps/mobile/src/lib/sessionGroupStatus.ts` so subsequent tickets (home screen, session detail header) reuse the camelCase translation. `archived` returns `null` (no chip) since archived rows live in their own segment and the segment label conveys the state.
- **Last-event preview** is sourced from the latest session in the group (`_sessionIdsByGroup[groupId]` → pick most recent by `_sortTimestamp` / `lastMessageAt`). The session's `_lastEventPreview` is a derived client field populated by ambient `session_output` events; freshly-queried groups won't have it until the first event lands, so the row hides the preview line gracefully when missing.
- **Pull-to-refresh** runs the focused `sessionGroups` query for the current segment in parallel with `refreshOrgData(orgId)` from ticket 16's shared helper. 401 still resets the entity store and signs the user out, mirroring the channels-list behavior.
- **Context menu**: tapped via `react-native-context-menu-view` on long-press. The "Archive workspace" item is omitted from the menu when the group is already archived, so the index handler shifts accordingly. Archive fires `ARCHIVE_SESSION_GROUP_MUTATION` and returns immediately — the row disappears from the Active segment when the `session_group_archived` event arrives via the ambient subscription (~1s).
- **Copy link** uses `expo-clipboard` (newly added in this ticket) with `trace://sessions/<groupId>`. Deep-link resolution lands in ticket 28; for now copying the URL is enough that the user can paste it in another app.
- **Glass header** (`SessionGroupsHeader`) sits above the FlashList, not inside it — the segmented control swap re-runs the data effect. Liquid Glass background matches the channel-list large-title aesthetic; the SegmentedControl is the design-system primitive (no per-screen restyle).
- **Time formatting** lives in `apps/mobile/src/lib/time.ts` — same breakpoints as `apps/web/src/lib/utils.ts#timeAgo` so a row reads identically on both platforms. Reuse from future mobile lists (home, session header) instead of re-deriving.
- **Sorting**: `_sortTimestamp` desc, fallback to `updatedAt` then `createdAt`. The handler in `packages/client-core/src/events/handlers.ts` already bumps `_sortTimestamp` on session activity and on archive, so live updates re-order rows automatically.
- **Empty states**: `bolt.horizontal` + "No active sessions in this channel" (active), `checkmark.seal` + "Nothing merged yet" (merged), `archivebox` + "Nothing archived" (archived). The active state nudges the user toward the web app since session creation is V2 (per plan §2 Non-Goals).

## How to test

1. Open a coding channel with multiple session groups in different states.
2. Active → see in_progress and needs_input groups.
3. Switch to Merged → see merged groups.
4. Long-press → context menu → Archive → group moves out of Active segment after ~1s (when archive event arrives via subscription).
5. Trigger a status change on web; mobile row updates live.
