# 16 — Channels List Screen

## Summary

Implement the Channels tab screen: lists all coding channels the user has access to, with live updates, search, and drill-down into each channel. Text channels are hidden in V1.

## What needs to happen

- `app/(authed)/channels/index.tsx` (<200 lines):
  - Reads channels from the entity store via `useEntityStore((s) => Object.values(s.channels).filter(c => c.type === 'coding'))` — a typed selector hook in `apps/mobile/src/hooks/useCodingChannels.ts` keeps the component lean.
  - Groups by `channelGroup` when groups exist; flat list otherwise.
  - Renders with `FlashList` from `@shopify/flash-list`.
  - Each row uses `ListRow` primitive: title (channel name), subtitle (active session count derived from entity store), trailing chevron.
  - Pull-to-refresh: refetches via existing hydration mechanism.
  - Search: native iOS `searchBar` slot in nav header (via `react-native-screens` `headerSearchBarOptions`). Filters visible channels by name case-insensitively. No server query — client-side filter.
- **No "Mine" filter on channels.** Channels don't have ownership and "channels I've recently worked in" is a session concern, not a channel concern. A similar filter will live on the session-level screens (home, session groups) instead.
- Live updates: the ambient `orgEvents` subscription already delivers channel events; no new subscription needed.
- Empty state (via `EmptyState`): icon `tray`, title "No coding channels yet", subtitle "Channels appear here as they're created in the web app."
- Tap row → navigate to `/channels/[id]`.

## Dependencies

- [13 — Data Primitives (ListRow, EmptyState)](13-data-primitives.md)
- [15 — Navigation Skeleton](15-navigation-tabs.md)
- Install: `@shopify/flash-list`

## Completion requirements

- [x] Channels list renders from entity store
- [x] Only coding channels shown (text channels filtered)
- [x] Search filters in real time
- [x] Pull-to-refresh re-hydrates
- [x] Live channel creates/renames reflect without refresh
- [x] File <200 lines (use selector hook + FlashList item renderer component if needed)

## Implementation notes (landed)

- **Stable-key selector pattern**: the top-level selector hook (`useCodingChannelKeys` in `apps/mobile/src/hooks/useCodingChannels.ts`) returns a flat `string[]` of keys shaped as `"channel:<id>"` or `"group:<id>"`. Returning primitive keys (instead of hydrated objects) keeps `useShallow` referentially stable across renders; earlier drafts that returned freshly-constructed objects tripped Zustand's `useSyncExternalStore` snapshot check and caused a render loop.
- **Fine-grained row subscriptions**: `ChannelListRow` and `ChannelGroupHeader` each pull their own fields via `useEntityField`. A per-channel `useChannelActiveSessionCount(channelId)` selector derives the subtitle count. This matches CLAUDE.md's "components take IDs, use `useEntityField`" rule and means a channel rename re-renders only that row.
- **Shared `refreshOrgData(orgId)`**: `apps/mobile/src/hooks/useHydrate.ts` now exports a standalone `refreshOrgData` helper that runs the same org + channelGroups + mySessions queries used at launch. `useHydrate` calls it once on mount; pull-to-refresh on this screen calls it again. Reuse it from any other tab that needs pull-to-refresh (home in 25, channel detail in 17) instead of re-declaring the queries.
- **`<Stack.Screen options={{ headerSearchBarOptions }} />` declarative pattern**: used instead of imperative `navigation.setOptions` because expo-router's `useNavigation()` doesn't return a stable reference across renders — the imperative version triggered a render loop.
- **Empty-state variants**: `magnifyingglass` with `"No channels found"` when the search returned nothing; `tray` with `"No coding channels yet"` when the org has no coding channels at all.
- **Native pull-to-reveal search bar**: `headerSearchBarOptions` uses the default `hideWhenScrolling: true` — the search bar is hidden at rest and revealed when the large-title header is pulled down, matching Mail / Settings. Plan §10.3 was clarified to reflect this.
- **"Active" session count = `in_progress` + `needs_input`**: the subtitle counts sessions the user can still influence. `merged`, `in_review`, and `failed` are excluded. Encoded in `useChannelActiveSessionCount`.
- **Pull-to-refresh UX**: fires `haptic.medium()` on trigger (plan §11.6) and handles 401 by resetting the entity store and logging out — same path as `useHydrate`'s initial-fetch unauthorized handler. `refreshOrgData` also bails out of its own upserts if the active org changes mid-flight, so an org switch or sign-out can't repopulate the store with stale data.
- **Orphan `groupId` handling**: channels whose `groupId` points at a `ChannelGroup` that hasn't hydrated yet (the `channel_*` event can arrive before its `channel_group_*` event) are rendered as ungrouped at the end of the list rather than silently dropped. When the group event arrives they reflow into their group section.
- **No "Mine" filter**: earlier drafts of the ticket + plan §10.3 called for an `All | Mine` segmented control, defined as "channels where the user has a recent session." On reflection this conflates a session concept (who started a session) with a channel concept (who has access), so the filter was dropped. A similar filter will live on session-level screens (home, session groups) where ownership actually applies.

## How to test

1. Sign in on mobile pointed at a server with existing coding channels.
2. Channels appear in list; tap one → navigates.
3. Pull to refresh.
4. Search: type → list filters.
5. Create/rename a channel on web; mobile reflects within 1s (via ambient subscription).
6. Empty state appears when org has no coding channels.
