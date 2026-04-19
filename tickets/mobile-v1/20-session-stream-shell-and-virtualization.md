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
- `NewActivityPill.tsx` (<100 lines):
  - Floating pill above composer; Liquid Glass background.
  - Shows "↓ N new" while count > 0 and user is away from bottom.
  - Tap → scroll to bottom, dismiss.
- Placeholder node renderer: for now, `<Text variant="body">{'[' + node.type + ']'}</Text>` — will be replaced in ticket 21.

## Dependencies

- [19 — Session Group Detail](19-session-group-detail-and-tab-strip.md)
- [04 — Event Handlers in client-core](04-extract-events-and-mutations.md)
- Install (if not already): `@shopify/flash-list`

## Completion requirements

- [ ] Session stream renders a placeholder per event
- [ ] Subscribes to `sessionEvents` on focus; unsubscribes on blur
- [ ] Scrolling back to top triggers pagination
- [ ] New events auto-scroll when at bottom; show "New activity" pill otherwise
- [ ] 120fps scrolling on ProMotion device with 500+ events
- [ ] All files <200 lines

## How to test

1. Open a session with many events → list renders placeholders for each event type.
2. Scroll to top → older events load in batches.
3. New event arrives while near bottom → auto-scrolls.
4. Scroll up, then new event arrives → "New activity" pill appears; tap → scrolls down.
5. Instruments / perf overlay shows no sustained frame drops during fast flicks.
