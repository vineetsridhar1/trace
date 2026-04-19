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
- Segmented control at top: `All | Mine` — "Mine" filters to channels where the user has a recent session (look at `sessions` in store, check `createdBy === currentUser`).
- Live updates: the ambient `orgEvents` subscription already delivers channel events; no new subscription needed.
- Empty state (via `EmptyState`): icon `tray`, title "No coding channels yet", subtitle "Channels appear here as they're created in the web app."
- Tap row → navigate to `/channels/[id]`.

## Dependencies

- [13 — Data Primitives (ListRow, EmptyState, SegmentedControl)](13-data-primitives.md)
- [15 — Navigation Skeleton](15-navigation-tabs.md)
- Install: `@shopify/flash-list`

## Completion requirements

- [ ] Channels list renders from entity store
- [ ] Only coding channels shown (text channels filtered)
- [ ] Search filters in real time
- [ ] Segmented "All / Mine" toggle works
- [ ] Pull-to-refresh re-hydrates
- [ ] Live channel creates/renames reflect without refresh
- [ ] File <200 lines (use selector hook + FlashList item renderer component if needed)

## How to test

1. Sign in on mobile pointed at a server with existing coding channels.
2. Channels appear in list; tap one → navigates.
3. Pull to refresh.
4. Search: type → list filters.
5. Create/rename a channel on web; mobile reflects within 1s (via ambient subscription).
6. Empty state appears when org has no coding channels.
