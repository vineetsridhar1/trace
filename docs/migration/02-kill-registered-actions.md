# Ticket 2: Kill the Registered Actions Anti-Pattern

## Goal
Remove the `syncActions` callback-registration pattern from `threadStore.ts` and the `workspaceActions` pattern from `agentRunStore.ts`. Replace with direct hook usage and the event bus from `lib/events.ts`.

## Context

### The Problem
Two stores use a "registered actions" pattern where hooks mount and register callback functions into the store:

**`threadStore.ts`** (lines 21-39, 66-67, 118-121):
- Defines a `ThreadSyncActions` interface with 6 methods
- Stores `syncActions` in state, initialized to noops
- `useThreadSync` hook registers real implementations on mount via `registerSyncActions()`
- Other code calls `useThreadStore.getState().syncActions.loadSessionEvents(workspace)` — **this only works if the hook has mounted**

**`agentRunStore.ts`** (lines 29-74, 88-91, 119-122):
- Defines a `WorkspaceActions` interface with 10 methods
- Stores `workspaceActions` in state, initialized to noops
- But `workspaceActions` is **never actually registered by any hook** in the web app. The `registerWorkspaceActions` is defined but never called. This means all 10 methods are always noops.

### Who calls `syncActions`?
Only one place: `useChannelSubscriptions.ts` line 82:
```ts
useThreadStore.getState().syncActions.loadSessionEvents(workspace).finally(() => {
  reloadingSessionRef.current = null;
});
```

This is called from `triggerSessionReload()` (line 69) when a subscription event arrives for a workspace whose session needs reloading.

### Who calls `workspaceActions`?
Nobody in the web app. It's dead code copied from the desktop pattern. The `WebThreadPanel.tsx` file imports from `threadStore` but doesn't reference `workspaceActions`. The `WebThreadInput.tsx` uses `useWorkspaceActions()` hook directly (which is the correct pattern).

## Tasks

### 1. Define event types in `lib/events.ts`

Add typed event constants to `apps/web/src/lib/events.ts` (created in Ticket 1):

```ts
// Add to the existing events.ts file:

// Event name constants for type safety
export const EVENTS = {
  SESSION_RELOAD_NEEDED: 'session:reload-needed',
} as const;

// Event payload types
export interface SessionReloadPayload {
  workspace: import('../types').Workspace;
}
```

### 2. Refactor `useChannelSubscriptions.ts` to emit events instead of calling syncActions

**File**: `apps/web/src/hooks/useChannelSubscriptions.ts`

**Current** (line 69-85):
```ts
const triggerSessionReload = (workspaceId: string) => {
  if (reloadingSessionRef.current === workspaceId) return;
  const threadState = useThreadStore.getState();
  const { sessions, activeSessionId } = threadState;
  const latestSession = sessions[sessions.length - 1];
  if (latestSession && activeSessionId !== latestSession.id) return;
  const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return;
  reloadingSessionRef.current = workspaceId;
  useThreadStore.getState().syncActions.loadSessionEvents(workspace).finally(() => {
    reloadingSessionRef.current = null;
  });
};
```

**Replace with**:
```ts
const triggerSessionReload = (workspaceId: string) => {
  if (reloadingSessionRef.current === workspaceId) return;
  const threadState = useThreadStore.getState();
  const { sessions, activeSessionId } = threadState;
  const latestSession = sessions[sessions.length - 1];
  if (latestSession && activeSessionId !== latestSession.id) return;
  const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return;
  reloadingSessionRef.current = workspaceId;
  appEvents.emit<SessionReloadPayload>(EVENTS.SESSION_RELOAD_NEEDED, { workspace });
  // The debounce reset will happen in useThreadSync where the event is handled
};
```

Add imports at the top:
```ts
import { appEvents, EVENTS, type SessionReloadPayload } from '../lib/events';
```

Remove the import of `syncActions`-related code. The `reloadingSessionRef` can be removed or kept for debounce — see note below.

**Note on debounce**: The current code uses `reloadingSessionRef` to prevent duplicate reloads. Move this debounce logic into `useThreadSync` where the event is handled, since that's where the actual loading happens.

### 3. Refactor `useThreadSync.ts` to listen for events

**File**: `apps/web/src/hooks/useThreadSync.ts`

**Remove** the `registerSyncActions`/`clearSyncActions` effect (lines 287-297):
```ts
// DELETE THIS:
useEffect(() => {
  useThreadStore.getState().registerSyncActions({
    loadSessionEvents,
    loadOlderEvents,
    switchSession,
    clearSession,
    openThreadPanel,
    reportAgentActivity: async () => {},
  });
  return () => useThreadStore.getState().clearSyncActions();
}, [loadSessionEvents, loadOlderEvents, switchSession, clearSession, openThreadPanel]);
```

**Add** an event listener for session reloads:
```ts
import { appEvents, EVENTS, type SessionReloadPayload } from '../lib/events';

// Add this effect in place of the removed registerSyncActions effect:
const reloadingRef = useRef<string | null>(null);

useEffect(() => {
  return appEvents.on<SessionReloadPayload>(EVENTS.SESSION_RELOAD_NEEDED, ({ workspace }) => {
    if (reloadingRef.current === workspace.id) return;
    reloadingRef.current = workspace.id;
    loadSessionEvents(workspace).finally(() => {
      reloadingRef.current = null;
    });
  });
}, [loadSessionEvents]);
```

### 4. Remove `syncActions` from `threadStore.ts`

**File**: `apps/web/src/stores/threadStore.ts`

Remove:
- The `ThreadSyncActions` interface (lines 21-28)
- The `noopWarn` function (line 30)
- The `defaultSyncActions` object (lines 32-39)
- The `syncActions` field from `ThreadState` interface (line 66)
- The `registerSyncActions` and `clearSyncActions` actions (lines 67-68)
- The `syncActions` initial value (line 119)
- The `registerSyncActions` and `clearSyncActions` implementations (lines 120-121)

### 5. Remove `workspaceActions` from `agentRunStore.ts`

**File**: `apps/web/src/stores/agentRunStore.ts`

Remove:
- The `WorkspaceActions` interface (lines 30-57)
- The `noopWarn` function (lines 59-61)
- The `defaultWorkspaceActions` object (lines 63-74)
- The `workspaceActions` field from `AgentRunState` interface (line 88)
- The `registerWorkspaceActions` and `clearWorkspaceActions` actions (lines 89-90)
- The `workspaceActions` initial value (line 120)
- The `registerWorkspaceActions` and `clearWorkspaceActions` implementations (lines 121-122)

### 6. Fix `WebThreadPanel.tsx` — replace `syncActions.clearSession()` call

**File**: `apps/web/src/components/WebThreadPanel.tsx`

Line 52 calls `syncActions.clearSession()` inside the plan actions handler:
```ts
const newSessionId = await useThreadStore.getState().syncActions.clearSession();
```

This is a **critical** consumer of syncActions that must be replaced. The `clearSession` function lives in `useThreadSync.ts` and creates a new session via GraphQL mutation, then updates the thread store.

**Fix**: Make `clearSession` available via a new event or by passing it down as a prop/callback.

**Option A (recommended — direct prop):**
1. In `WorkspacePage.tsx`, get `clearSession` from `useThreadSync()` and pass it to `WebThreadPanel` as a prop:
```tsx
const { clearSession } = useThreadSync();
// ...
<WebThreadPanel workspaceId={...} channelId={...} clearSession={clearSession} />
```

2. In `WebThreadPanel.tsx`, add `clearSession` to the props interface and use it directly:
```ts
interface WebThreadPanelProps {
  workspaceId: string;
  channelId: string;
  clearSession: () => Promise<string | null>;
}
// ...
const newSessionId = await clearSession();
```

**Option B (event bus):** Emit an event and wait for the response. This is more complex and not recommended for synchronous request-response patterns.

Also verify no other `syncActions` references exist:
```bash
grep -r "syncActions" apps/web/src/
```

### 7. Verify no other consumers of syncActions or workspaceActions

Run:
```bash
grep -r "syncActions\|workspaceActions\|registerSyncActions\|registerWorkspaceActions\|clearSyncActions\|clearWorkspaceActions" apps/web/src/
```

After the changes, this should return zero results.

Also check if `WebThreadPanel.tsx` calls `syncActions.loadOlderEvents()`. If so, pass `loadOlderEvents` as a prop from `WorkspacePage.tsx` the same way as `clearSession`.

## Verification

1. `cd apps/web && npx tsc --noEmit` — no type errors
2. `grep -r "syncActions\|workspaceActions" apps/web/src/` — returns nothing (only agentRunStore.ts definition if partially done; should be zero when complete)
3. `cd apps/web && npx vite build` — production build succeeds
4. Functional test: Open a workspace thread, wait for a subscription event to arrive (e.g., trigger a workspace status change) — the thread should reload correctly via the event bus
5. Functional test: Open thread panel, verify events load, verify "load older events" still works

## Files Changed
- **Modified**: `apps/web/src/stores/threadStore.ts`, `apps/web/src/stores/agentRunStore.ts`, `apps/web/src/hooks/useThreadSync.ts`, `apps/web/src/hooks/useChannelSubscriptions.ts`, `apps/web/src/lib/events.ts`
- **Possibly modified**: `apps/web/src/components/WebThreadPanel.tsx` (if it calls `syncActions.loadOlderEvents`)

## Dependencies
- Requires Ticket 1 (needs `lib/events.ts` to exist)
- **Interaction with Ticket 6**: If Ticket 6 is done first, the `openThreadPanel` function in `useThreadSync.ts` will already be rewritten. The `syncActions.openThreadPanel` registration must still be removed, but the event bus listener for `SESSION_RELOAD_NEEDED` should work alongside the new stale-while-revalidate pattern without conflict.
- **Interaction with Ticket 4**: If Ticket 4 is done first, `WebThreadPanel.tsx` will be split into smaller files. The `clearSession` prop plumbing in Task 6 should be applied to the decomposed `ThreadPanel.tsx` instead.
