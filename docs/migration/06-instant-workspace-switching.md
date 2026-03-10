# Ticket 6: Instant Workspace Switching

## Goal
Eliminate the 500ms-1s delay when clicking between workspaces. Workspace threads should open instantly from a local cache, with background revalidation to pick up any missed events.

## The Problem

When a user clicks a workspace, the current code:

1. **Wipes all thread data** — `openThreadPanelUI()` in `threadStore.ts` (line 203-224) sets `sessionEvents: []`, `sessions: []`, `sessionStatus: 'loading'`. The UI immediately shows a loading skeleton.
2. **Waits 150ms** — `openThreadPanel` in `useThreadSync.ts` (line 271) has a `setTimeout(..., 150)` debounce before starting any fetch.
3. **Fetches sessions** — `executeSessions()` query with `fetchPolicy: 'network-only'` (line 161). Bypasses Apollo cache. ~50-100ms network round trip.
4. **Then sequentially fetches events** — `executeSessionEvents()` query with `fetchPolicy: 'network-only'` (line 143). Another ~50-100ms.
5. **Renders** — 20-50ms.

**Total: 300-500ms minimum, often 1s.** And switching back to a previously-viewed workspace re-fetches everything from scratch — zero caching.

Meanwhile, subscriptions are already pushing real-time event updates for the active channel, but events for non-selected workspaces are **silently discarded** (`useChannelSubscriptions.ts` line 205-206).

## The Fix: Stale-While-Revalidate Per-Workspace Cache

### Core idea
Keep a per-workspace cache of sessions and events in the thread store. When the user clicks a workspace:
1. **Instantly display cached data** (if any) — zero delay
2. **Revalidate in the background** — fetch fresh data and merge, without a loading state
3. **Buffer subscription events** for non-selected workspaces instead of discarding them

For workspaces that haven't been opened yet, show a loading state as today but without the 150ms debounce.

## Tasks

### 1. Add per-workspace session cache to `threadStore.ts`

**File**: `apps/web/src/stores/threadStore.ts`

Add a cache structure:

```ts
interface CachedWorkspaceSession {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  sessionEvents: ServerEvent[];
  sessionTotal: number;
  tokenUsage: TokenUsageInfo | null;
  /** Timestamp of last server fetch — used to decide when to revalidate */
  lastFetchedAt: number;
}

interface ThreadState {
  // ... existing fields ...

  // Per-workspace cache
  sessionCache: Map<string, CachedWorkspaceSession>;

  // Cache actions
  cacheCurrentSession: () => void;
  restoreFromCache: (workspaceId: string) => boolean;
  updateCache: (workspaceId: string, data: Partial<CachedWorkspaceSession>) => void;
  evictCache: (workspaceId: string) => void;
  appendCachedEvent: (workspaceId: string, event: ServerEvent) => void;
  updateCachedEvent: (workspaceId: string, event: ServerEvent) => void;
}
```

**`cacheCurrentSession()`** — saves the current session/events to the cache under the current `selectedWorkspaceId`:
```ts
cacheCurrentSession: () => set((state) => {
  if (!state.selectedWorkspaceId || state.sessionStatus === 'loading') return state;
  const cached: CachedWorkspaceSession = {
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    sessionEvents: state.sessionEvents,
    sessionTotal: state.sessionTotal,
    tokenUsage: state.tokenUsage,
    lastFetchedAt: Date.now(),
  };
  const next = new Map(state.sessionCache);
  next.set(state.selectedWorkspaceId, cached);
  return { sessionCache: next };
}),
```

**`restoreFromCache(workspaceId)`** — restores cached data to the active thread state. Returns true if cache hit:
```ts
restoreFromCache: (workspaceId) => {
  const cached = get().sessionCache.get(workspaceId);
  if (!cached) return false;
  set({
    sessions: cached.sessions,
    activeSessionId: cached.activeSessionId,
    sessionEvents: cached.sessionEvents,
    sessionTotal: cached.sessionTotal,
    tokenUsage: cached.tokenUsage,
    sessionStatus: 'ready',
    expandedReadGroupIds: {},
    expandedTurnGroupIds: {},
    loadingOlderEvents: false,
  });
  return true;
},
```

**`appendCachedEvent(workspaceId, event)`** — appends an event to a cached workspace (for subscription events targeting non-selected workspaces):
```ts
appendCachedEvent: (workspaceId, event) => set((state) => {
  const cached = state.sessionCache.get(workspaceId);
  if (!cached) return state;
  // Don't append if we already have this event
  if (cached.sessionEvents.some((e) => e.id === event.id)) return state;
  const next = new Map(state.sessionCache);
  next.set(workspaceId, {
    ...cached,
    sessionEvents: [...cached.sessionEvents, event],
    sessionTotal: cached.sessionTotal + 1,
  });
  return { sessionCache: next };
}),
```

**`updateCachedEvent(workspaceId, event)`** — updates an existing event in cache:
```ts
updateCachedEvent: (workspaceId, event) => set((state) => {
  const cached = state.sessionCache.get(workspaceId);
  if (!cached) return state;
  const idx = cached.sessionEvents.findIndex((e) => e.id === event.id);
  if (idx < 0) return state;
  const events = [...cached.sessionEvents];
  events[idx] = event;
  const next = new Map(state.sessionCache);
  next.set(workspaceId, { ...cached, sessionEvents: events });
  return { sessionCache: next };
}),
```

Initialize `sessionCache` as `new Map()` in the store's initial state.

### 2. Rewrite `openThreadPanel` in `useThreadSync.ts`

**File**: `apps/web/src/hooks/useThreadSync.ts`

Replace the current `openThreadPanel` (lines 266-277) with a stale-while-revalidate pattern:

```ts
const openThreadPanel = useCallback(
  (workspace: Workspace) => {
    // 1. Cache the CURRENT workspace's session before switching away
    useThreadStore.getState().cacheCurrentSession();

    // 2. Set selection state immediately
    const saved = parseInt(localStorage.getItem('trace:threadWidth') ?? '', 10);
    const width = saved >= 280
      ? Math.min(Math.max(saved, 280), window.innerWidth - 200)
      : Math.min(Math.max(Math.floor(window.innerWidth * 0.65), 280), 1600);

    set({
      selectedWorkspaceId: workspace.id,
      selectedWorkspace: workspace,
      threadWidth: width,
    });

    // 3. Try to restore from cache — instant display
    const hit = useThreadStore.getState().restoreFromCache(workspace.id);

    if (hit) {
      // Cache hit: show cached data immediately, revalidate in background
      // Use a stale threshold — if data is <5s old, don't even revalidate
      const cached = useThreadStore.getState().sessionCache.get(workspace.id);
      const age = cached ? Date.now() - cached.lastFetchedAt : Infinity;
      if (age > 5000) {
        void revalidateSessionEvents(workspace);
      }
    } else {
      // Cache miss: show loading state, fetch normally
      useThreadStore.getState().setSessionStatus('loading');
      useThreadStore.getState().setSessionEvents([]);
      useThreadStore.getState().setSessions([]);
      void loadSessionEvents(workspace);
    }
  },
  [loadSessionEvents],
);
```

### 3. Add `revalidateSessionEvents` function to `useThreadSync.ts`

This is like `loadSessionEvents` but doesn't show a loading state — it fetches in the background and merges results:

```ts
const revalidateSessionEvents = useCallback(
  async (workspace: Workspace) => {
    try {
      const { data: sessionsData } = await executeSessions({
        variables: { channelId: workspace.channelId, workspaceId: workspace.id },
        fetchPolicy: 'network-only',
      });

      // Check user hasn't navigated away
      if (useThreadStore.getState().selectedWorkspaceId !== workspace.id) return;

      const sessionList = (sessionsData?.sessions ?? []) as SessionInfo[];
      useThreadStore.getState().setSessions(sessionList);

      if (sessionList.length === 0) {
        useThreadStore.getState().setSessionEvents([]);
        useThreadStore.getState().setSessionStatus('empty');
        return;
      }

      const latestSession = sessionList[sessionList.length - 1];
      const currentActiveId = useThreadStore.getState().activeSessionId;

      // If user is on a different (older) session, don't overwrite their events
      if (currentActiveId && currentActiveId !== latestSession.id) return;

      useThreadStore.getState().setActiveSessionId(latestSession.id);

      const { data: eventsData } = await executeSessionEvents({
        variables: {
          channelId: workspace.channelId,
          workspaceId: workspace.id,
          sessionId: latestSession.id,
          limit: SESSION_PAGE_SIZE,
        },
        fetchPolicy: 'network-only',
      });

      if (useThreadStore.getState().selectedWorkspaceId !== workspace.id) return;

      applyEventsResult(workspace.channelId, workspace.id, latestSession.id, eventsData?.sessionEvents);
      // Update cache with fresh data
      useThreadStore.getState().cacheCurrentSession();
    } catch {
      // Background revalidation failure — don't show error, cached data is still displayed
      console.warn('Background revalidation failed for workspace', workspace.id);
    }
  },
  [executeSessions, executeSessionEvents, applyEventsResult],
);
```

### 4. Remove the 150ms debounce

In the current `openThreadPanel`, delete the `setTimeout(..., 150)`. There's no reason for it. The debounce was likely added to avoid firing queries when the user is rapidly clicking through workspaces, but the existing check `if (useThreadStore.getState().selectedWorkspaceId !== workspace.id) return` already handles that — stale fetches are discarded when they complete.

### 5. Buffer subscription events for cached workspaces

**File**: `apps/web/src/hooks/useChannelSubscriptions.ts`

Currently, when a subscription event arrives for a workspace that isn't selected, it's discarded (lines 204-206):
```ts
const threadState = useThreadStore.getState();
if (threadState.selectedWorkspaceId !== payload.workspaceId) return;
```

Change this to also buffer events for cached workspaces:

```ts
const threadState = useThreadStore.getState();

if (threadState.selectedWorkspaceId === payload.workspaceId) {
  // Currently selected — append to active view (existing behavior)
  useThreadStore.getState().appendSessionEvent(payload.event as ServerEvent);
} else if (threadState.sessionCache.has(payload.workspaceId)) {
  // Not selected but cached — buffer the event in cache
  useThreadStore.getState().appendCachedEvent(payload.workspaceId, payload.event as ServerEvent);
}
// Not selected and not cached — discard (same as before)
```

Do the same for `SESSION_EVENT_UPDATED_SUBSCRIPTION` (lines 219-247):
```ts
if (threadState.selectedWorkspaceId === payload.workspaceId) {
  useThreadStore.getState().updateSessionEvent(payload.event as ServerEvent);
} else if (threadState.sessionCache.has(payload.workspaceId)) {
  useThreadStore.getState().updateCachedEvent(payload.workspaceId, payload.event as ServerEvent);
}
```

### 6. Cache eviction strategy

Add a simple LRU-style eviction to prevent unbounded memory growth. Keep at most ~20 cached workspaces. When adding a new entry that would exceed the limit, evict the least recently fetched one:

```ts
// In cacheCurrentSession:
const MAX_CACHED_WORKSPACES = 20;

cacheCurrentSession: () => set((state) => {
  if (!state.selectedWorkspaceId || state.sessionStatus === 'loading') return state;
  const next = new Map(state.sessionCache);
  next.set(state.selectedWorkspaceId, { /* ... */ });

  // Evict oldest if over limit
  if (next.size > MAX_CACHED_WORKSPACES) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, val] of next) {
      if (val.lastFetchedAt < oldestTime) {
        oldestTime = val.lastFetchedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) next.delete(oldestKey);
  }

  return { sessionCache: next };
}),
```

### 7. Pre-warm cache for visible workspaces (optional but high impact)

After the initial workspace list loads, pre-fetch sessions for the first few in-progress workspaces in the background. This means by the time the user clicks one, the data is already cached.

**File**: `apps/web/src/hooks/useWorkspaceSync.ts` or a new `useSessionPrewarm.ts`

```ts
// After workspaces are loaded, pre-warm the top N in-progress workspaces
const IN_PROGRESS_STATUSES = ['in_progress', 'needs_input', 'pending'];
const PREWARM_COUNT = 5;

useEffect(() => {
  const workspaces = useWorkspaceStore.getState().workspaces;
  const toPrewarm = workspaces
    .filter((w) => IN_PROGRESS_STATUSES.includes(w.status))
    .slice(0, PREWARM_COUNT);

  for (const workspace of toPrewarm) {
    // Skip if already cached
    if (useThreadStore.getState().sessionCache.has(workspace.id)) continue;
    // Fetch in background with low priority
    void prewarmWorkspaceSession(workspace);
  }
}, [workspaces loaded]);
```

The `prewarmWorkspaceSession` function fetches sessions + events and stores them directly in the cache without touching the active thread state. This should use a small delay between each fetch to avoid flooding the server.

**This is optional** — the stale-while-revalidate pattern from tasks 1-6 already makes switching between previously-viewed workspaces instant. Pre-warming just extends that to workspaces you haven't clicked yet.

### 8. Also cache on channel switch

When the user switches channels, the current code calls `clearWorkspaces()` which wipes the workspace list. The session cache should NOT be cleared on channel switch — workspace IDs are globally unique, so cached data from a different channel is still valid if the user switches back.

Verify that `closeThreadPanel` in `threadStore.ts` does NOT clear `sessionCache`. Only clear the active thread state.

## Expected Result

| Scenario | Before | After |
|----------|--------|-------|
| Click workspace (first time) | 500ms-1s loading screen | ~200-400ms loading screen (no debounce) |
| Click workspace (previously viewed) | 500ms-1s loading screen | **Instant** (~0ms), background revalidation |
| Click workspace A → B → A | 1-2s total loading | First click loads, second click **instant** |
| Subscription events for non-selected workspace | Discarded | Buffered in cache |
| Switch channels and back | Everything re-fetched | Workspace list re-fetched, sessions still cached |

## Verification

1. `cd apps/web && npx tsc --noEmit` — no type errors
2. `cd apps/web && npx vite build` — builds
3. **Timing test**: Open a workspace, note the time. Click a different workspace. Click back to the first one — it should render instantly (no loading skeleton, no flash).
4. **Subscription test**: Open workspace A (agent running). Switch to workspace B. Wait for events to arrive (check server logs or wait ~10s). Switch back to A — the new events should be there without a refetch flash.
5. **Memory test**: Open 25+ workspaces one by one. Check browser memory — it should stay bounded (oldest cached workspaces get evicted).
6. **Stale data test**: Open workspace A. Wait 10s. Switch away and back. Verify background revalidation fires (check Network tab) but UI shows cached data instantly.
7. **Edge case**: Open a workspace, switch to a different channel, switch back, click the same workspace — should restore from cache.

## Files Changed
- **Modified**: `apps/web/src/stores/threadStore.ts` (add session cache + cache actions), `apps/web/src/hooks/useThreadSync.ts` (rewrite openThreadPanel, add revalidateSessionEvents, remove debounce), `apps/web/src/hooks/useChannelSubscriptions.ts` (buffer events for cached workspaces)
- **Optionally created**: `apps/web/src/hooks/useSessionPrewarm.ts`

## Dependencies
- Independent of Tickets 1-5 (can be done at any point)
- If Ticket 2 is done first, the `syncActions.loadSessionEvents` call is already gone and replaced with event bus — adjust accordingly
