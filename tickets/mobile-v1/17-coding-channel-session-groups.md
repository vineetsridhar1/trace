# 17 — Coding Channel: Session Groups List

## Summary

The coding channel detail screen — the user's landing page when drilling into a channel. Lands on **active** session groups with an `All | Mine` filter for ownership scope. Merged & archived groups live behind a navigation-bar archive button on a separate sub-screen, mirroring the web app's secondary view. Rows live-update with name, status chip, branch, last-event preview, and relative time.

## What needs to happen

- `app/(authed)/channels/[id].tsx` (<200 lines):
  - Reads `channelId` from route params.
  - On mount: query `sessionGroups(channelId, archived: false)`; render with the `All | Mine` filter.
  - Header right (`Stack.Screen options.headerRight`): SF-Symbol `archivebox` button → `router.push("/channels/[id]/merged-archived")`.
  - Subscribes (mounts) to `sessionEvents` scope not needed here — ambient `orgEvents` suffices; this view just filters entity store.
- `app/(authed)/channels/[id]/merged-archived.tsx`:
  - Sibling sub-screen with `Merged | Archived` segmented control.
  - On segment change, query `sessionGroups(channelId, archived: true)` or `sessionGroups(channelId, archived: false, status: "merged")` and upsert into the store.
  - Same row renderer; pull-to-refresh refetches the current segment.
- Header (in `SessionGroupsHeader.tsx`):
  - Compact filter bar: `All | Mine` segmented control + centered count caption ("N active · M needs input").
  - Native nav bar already shows the channel name — no duplicate title in the body.
- Header (in `MergedArchivedHeader.tsx`):
  - `Merged | Archived` segmented control on its own filter bar.
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

- [x] Active session groups list renders with status chips and live updates
- [x] `All | Mine` filter on the active screen ("Mine" = groups whose earliest session is mine)
- [x] Header archive button opens a separate `Merged & Archived` sub-screen
- [x] Sub-screen segmented control switches between merged / archived with focused queries
- [x] Status chip colors match plan (§11.2)
- [x] Long-press archives via mutation → optimistic removal on ambient event
- [x] All files <200 lines

## Implementation notes (landed)

- **Why split the screens**: collapsing Active / Merged / Archived into one segmented control on the landing page made the screen feel cluttered and put two infrequently-visited segments next to the most-visited one. The web app already keeps Merged & Archived behind a separate "archive" entry point — mirroring that on mobile keeps the landing page focused on what's actually in flight.
- **"Mine" filter** = the earliest session in the group was created by the current user. Same heuristic as the web's `createdBySession` derivation in `useSessionGroupRows`. Groups the user only contributed to (without starting) intentionally don't count, since "owner" should be a stable signal not a who-touched-it-last thing. When `currentUserId` is null (no auth), Mine returns nothing rather than crashing.
- **Stable-ID selectors**: `useActiveSessionGroupIds(channelId, scope, currentUserId)` and `useMergedArchivedSessionGroupIds(channelId, scope)` return sorted `string[]` of group IDs through `useShallow`, so the FlashList only re-renders when the visible set changes. Same primitive-key pattern that ticket 16 settled on for channels.
- **Shared query helper**: `fetchChannelSessionGroups(channelId, view)` lives in `apps/mobile/src/hooks/useChannelSessionGroupsQuery.ts` and is reused by both screens. The `active` view queries `archived: false`, `merged` queries `archived: false, status: "merged"`, `archived` queries `archived: true`. Both screens upsert into the entity store and re-render from selectors, so ambient `orgEvents` updates flow through naturally without a manual refetch.
- **Status → chip mapping** is centralized in `apps/mobile/src/lib/sessionGroupStatus.ts` so subsequent tickets (home screen, session detail header) reuse the camelCase translation. `archived` returns `null` (no chip) since archived rows live in their own screen and the screen title conveys the state.
- **Last-event preview** is sourced from the latest session in the group (`_sessionIdsByGroup[groupId]` → pick most recent by `_sortTimestamp` / `lastMessageAt`). The session's `_lastEventPreview` is a derived client field populated by ambient `session_output` events; freshly-queried groups won't have it until the first event lands, so the row hides the preview line gracefully when missing.
- **Pull-to-refresh** on the active screen runs the focused `sessionGroups(active)` query in parallel with `refreshOrgData(orgId)` from ticket 16's shared helper. 401 still resets the entity store and signs the user out. The merged-archived screen pull only refetches its current segment — no need to re-hydrate the full org from a sub-screen.
- **Header right archive button**: declared via `Stack.Screen options.headerRight` so it lives in the native nav bar (correct iOS placement) rather than as a body button. Uses `expo-symbols`' `archivebox` for visual consistency with the empty-state and the action sheet.
- **Context menu**: tapped via `react-native-context-menu-view` on long-press. The "Archive workspace" item is omitted from the menu when the group is already archived, so the index handler shifts accordingly. Archive fires `ARCHIVE_SESSION_GROUP_MUTATION` and returns immediately — the row disappears from the Active screen when the `session_group_archived` event arrives via the ambient subscription (~1s) and reappears on the Archived screen.
- **Copy link** uses `expo-clipboard` (newly added in this ticket) with `trace://sessions/<groupId>`. Deep-link resolution lands in ticket 28; for now copying the URL is enough that the user can paste it in another app.
- **No big body header**: an earlier draft put the channel name + count subtitle inside a Liquid Glass card at the top of the body. The native nav bar already shows the channel name, so the body card was a duplicate that fought with the dark content for visual weight. The header is now a thin filter bar (segmented control + small caption) that disappears into the screen background.
- **Time formatting** lives in `apps/mobile/src/lib/time.ts` — same breakpoints as `apps/web/src/lib/utils.ts#timeAgo` so a row reads identically on both platforms. Reuse from future mobile lists (home, session header) instead of re-deriving.
- **Sorting**: `_sortTimestamp` desc, fallback to `updatedAt` then `createdAt`. The handler in `packages/client-core/src/events/handlers.ts` already bumps `_sortTimestamp` on session activity and on archive, so live updates re-order rows automatically.
- **Empty states**: `bolt.horizontal` + "No active sessions in this channel" (active/all), `person` + "No sessions you started" (active/mine, with a hint to switch to All), `checkmark.seal` + "Nothing merged yet" (merged), `archivebox` + "Nothing archived" (archived). The active/all state nudges the user toward the web app since session creation is V2 (per plan §2 Non-Goals).

## How to test

1. Open a coding channel with multiple session groups in different states.
2. Land on Active → see in_progress and needs_input groups under the All filter.
3. Switch to Mine → list narrows to groups whose earliest session you started.
4. Tap the archive button in the nav bar → Merged & Archived sub-screen opens with Merged segment.
5. Switch to Archived → see archived groups loaded by the focused query.
6. Long-press a group on Active → context menu → Archive → group moves to the Archived segment after ~1s when the archive event arrives via subscription.
7. Trigger a status change on web; mobile row updates live.
