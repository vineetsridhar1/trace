# 20 — Session Stream Shell and Virtualization

## Summary

The scaffold of the main session screen: the session header, the virtualized `FlashList` that renders events as nodes, session subscription wiring, pagination on scroll-to-top, auto-scroll-to-bottom behavior, and the floating "New activity" pill. Node renderers are the next ticket — this ticket just renders each event as a placeholder `<Text>{event.type}</Text>` so the list infrastructure is proven.

## What needs to happen

- `app/(authed)/sessions/[groupId]/[sessionId].tsx` (<150 lines — mostly composition):
  - Read `sessionId` from params.
  - Query `session(id)` (via existing client-core mutations module) to ensure full entity hydration incl. queuedMessages + gitCheckpoints.
  - Subscribe to `sessionEvents(sessionId, organizationId)` — via a `useSessionEvents` React hook in `apps/mobile/src/hooks/useSessionEvents.ts` that calls the existing client-core handler on each arrival.
  - Subscribe to `sessionStatusChanged(sessionId, organizationId)` similarly.
  - Unsubscribe both on screen blur (`useFocusEffect`).
- `SessionStream.tsx` (<200 lines):
  - Uses `FlashList` with `estimatedItemSize={80}`, `inverted={false}`, `maintainVisibleContentPosition` for correct scroll behavior when older events prepend.
  - Node building: local hook `useSessionNodes(sessionId)` reads scoped events via `useScopedEvents(eventScopeKey('session', sessionId))` and transforms them into `SessionNode[]` identical to web's node model — but rendering logic lives in the per-node renderer (next ticket).
  - Pagination: on reaching top, fetch older events using the existing paginated query pattern from web (via `before: timestamp` arg).
  - Auto-scroll: if user is within 120pt of bottom when a new node arrives, auto-scroll-to-bottom. Otherwise show floating "New activity" pill above the input composer (pill appears at bottom-right above safe area; tap: scrolls to bottom).
  - Scroll position preserved across re-mounts within session (store in memory ref).
  - Render a skeleton stream while the initial `session(id)` query is loading, then render "Waiting for agent to start..." when hydration completes but the session has no events yet.
- `NewActivityPill.tsx` (<100 lines):
  - Floating pill above composer; Liquid Glass background.
  - Shows "↓ N new" while count > 0 and user is away from bottom.
  - Tap → scroll to bottom, dismiss.
- Placeholder node renderer: for now, `<Text variant="body">{'[' + node.type + ']'}</Text>` — will be replaced in ticket 21.

## Dependencies

- [19 — Session Group Detail](19-session-group-detail-and-tab-strip.md)
- [04 — Event Handlers in client-core](04-extract-events-and-mutations.md)
- Install (if not already): `@shopify/flash-list`

## Pre-work carried over from ticket 19

Resolve these before wiring the stream — the shell landed in ticket 19 but left two unresolved choices that affect how the stream plugs in:

- [x] **Overflow menu must open on tap.** Added `dropdownMenuMode?: boolean` to `IconButton`; `SessionGroupHeader` passes `dropdownMenuMode` on the `ellipsis.circle` button so the context menu opens on tap.
- [x] **Header strategy (Option B applied).** Pulled `SessionGroupHeader` + `SessionTabStrip` out of the scroll view in `[sessionId].tsx`; `SessionStream` owns the `FlashList` below them. Solid-on-scroll state is driven from `FlashList`'s scroll offset (>8pt → solid) via an `onScrollOffsetChange` callback from `SessionStream`. The native `Stack.Screen` title now shows the session name (not the group name) to remove the duplicate, keeping the back chevron + small title and letting the custom Glass header own the group context.

## Completion requirements

- [x] Session stream renders a placeholder per event (`<Text>[{node.kind}]</Text>` in `SessionStream.tsx`; replaced by real renderers in ticket 21)
- [x] Subscribes to `sessionEvents` + `sessionStatusChanged` on mount; unsubscribes on unmount (screen blur in expo-router unmounts the stack child)
- [x] Initial loading state renders skeleton placeholders; no-event sessions show "Waiting for agent to start…"
- [x] Scrolling back to top triggers pagination via `FlashList`'s `onStartReached` + `before: oldestTimestamp` query
- [x] New events auto-scroll when within 120pt of bottom; show "New activity" pill otherwise
- [ ] 120fps scrolling on ProMotion device with 500+ events — requires a real device run; FlashList v2 recycling + placeholder-only renderers should clear this comfortably. Verify in M6 polish pass.
- [x] All files <200 lines (largest: `SessionGroupHeader.tsx` at 193; `SessionTabStrip.tsx` at 186; `SessionStream.tsx` at 184; `useSessionEvents.ts` at 182)

## How to test

1. Open a session with many events → list renders placeholders for each event type.
2. Open a brand-new session with zero events → "Waiting for agent to start..." appears after hydration.
3. Scroll to top → older events load in batches.
4. New event arrives while near bottom → auto-scrolls.
5. Scroll up, then new event arrives → "New activity" pill appears; tap → scrolls down.
6. Instruments / perf overlay shows no sustained frame drops during fast flicks.

## Implementation notes

- `buildSessionNodes`, `SessionNode`, `ReadGlobItem`, and `HIDDEN_SESSION_PAYLOAD_TYPES` were extracted from `apps/web/src/components/session/groupReadGlob.ts` + `apps/web/src/lib/session-event-filters.ts` into `packages/client-core/src/session/` so mobile and web share one node model (per plan §7.1). The old web files are now thin re-exports — downstream web imports continue to work unchanged.
- `useSessionEvents` (mobile) mirrors web's hook: initial page via `events(scope, limit, before)`, `sessionEvents` subscription for live full payloads, `sessionStatusChanged` subscription that patches the session entity in the store.
- `estimatedItemSize` is no longer a `FlashList` prop in v2 (automatic measurement). The ticket's requirement remains honored via `maintainVisibleContentPosition.autoscrollToBottomThreshold`.
- Scroll offset memoized per `sessionId` in a module-level `Map` so re-mounts within a session restore position; a different session starts at the bottom (per "initial scroll to end" flow).
