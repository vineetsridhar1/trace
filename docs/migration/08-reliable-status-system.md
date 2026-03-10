# Ticket 8: Reliable Status System

## Goal
Eliminate status desync between agent reality and what the UI displays. Make status transitions deterministic, server-authoritative, and observable. After this ticket, if Claude is running, the UI says "running". If Claude is done, the UI says "done". Always.

## Problem Statement

The current status system has **10 identified race conditions** that cause the UI to show the wrong status. The root causes are:

1. **Two independent paths set the same status** — the client calls `updateWorkspaceStatus` via GraphQL mutation AND the server auto-transitions in `ingestEvent`. They race.
2. **The service-layer `updateWorkspaceStatus()` doesn't broadcast** — it's a raw DB write. Only the GraphQL resolver publishes `WORKSPACE_UPSERTED`. Auto-transitions in `ingestEvent` rely on the end-of-function broadcast, which may carry stale data or fail.
3. **Client-side `activeRunWorkspaceIds` is a lie** — it's set optimistically before spawn and cleared only when a `Stop` subscription arrives. If the subscription disconnects, the Stop is missed and the UI is stuck.
4. **`appendPromptToWorkspaceSession` resets to `pending`** even if the agent is actively running (`in_progress`), creating a brief flash of wrong status.
5. **Stop event deduplication** can merge Stops from different runs within a 60-second window.
6. **The stuck-workspace reconciliation** (both client and server) has arbitrary timeouts that don't match reality.

## Architecture Principle

**The server is the single source of truth for status.** The client should never optimistically set status — it should only reflect what the server tells it via subscriptions. The server should broadcast status changes atomically with every DB write.

## Tasks

### 1. Make `updateWorkspaceStatus` always broadcast

**File**: `apps/server/src/services/workspaceService.ts`

The current function is a silent DB write:
```ts
export async function updateWorkspaceStatus(workspaceId: string, status: string) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { status },
  });
}
```

Change it to broadcast after every status change:
```ts
export async function updateWorkspaceStatus(
  workspaceId: string,
  status: string,
  channelId?: string,
): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { status },
  });

  // Always broadcast so every status change is immediately visible to all clients.
  // If channelId isn't provided, look it up.
  const resolvedChannelId = channelId ?? (await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { channelId: true },
  }))?.channelId;

  if (resolvedChannelId) {
    const workspace = await getWorkspaceByIdForFeed(workspaceId);
    if (workspace) {
      pubsub.publish(TOPICS.WORKSPACE_UPSERTED(resolvedChannelId), {
        workspaceUpserted: workspace,
      });
    }
  }
}
```

Then update ALL callers of `updateWorkspaceStatus` throughout the server to pass `channelId` when available (most already have it in scope):

- `eventService.ts` — all 5 auto-transitions already have `channelId` in scope
- `ticketService.ts` — `reconcileStaleWorkspaces` has `channelId`
- `ticketService.ts` — `triggerReviewIfAutonomous` has `channelId`
- `workspaceService.ts` — `appendPromptToWorkspaceSession` has `channelId`

This eliminates the problem where auto-transitions silently change the DB but the client doesn't learn about it until some later broadcast.

### 2. Remove redundant broadcasts in `eventService.ts`

After Task 1, `updateWorkspaceStatus` already broadcasts. The manual `pubsub.publish(WORKSPACE_UPSERTED)` calls scattered throughout `ingestEvent` become redundant and create double-broadcasts.

**Current pattern in `ingestEvent`**:
```ts
await updateWorkspaceStatus(workspace.id, "in_progress");  // now broadcasts
// ... later in the function ...
const hydratedWorkspace = await getWorkspaceByIdForFeed(workspace.id);
pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), { workspaceUpserted: hydratedWorkspace }); // REDUNDANT
```

**Fix**: Keep the final broadcast at the end of `ingestEvent` (lines 612-627) since it also carries summary/preview changes, but remove the intermediate workspace fetches and publishes on the deduped-stop path (lines 448-453) since `runAutoCompleteIfNeeded` now broadcasts via `updateWorkspaceStatus`.

Review each `pubsub.publish(WORKSPACE_UPSERTED)` in `eventService.ts` and remove those that are now covered by `updateWorkspaceStatus`. Keep the final broadcast per event to pick up non-status changes (preview, summary, branch).

### 3. Fix `appendPromptToWorkspaceSession` status reset

**File**: `apps/server/src/services/workspaceService.ts`, line 311

**Problem**: When a user sends a follow-up message, the status resets to `pending` regardless of current status:
```ts
status: workspace.status === 'review' ? 'review' : 'pending',
```

If the agent is `in_progress`, this briefly resets to `pending` before events transition it back. The UI flashes "Pending" while the agent is actively working.

**Fix**: Only reset to `pending` from terminal-ish states. If the agent is currently active, leave the status alone:
```ts
const KEEP_CURRENT_STATUSES = new Set(['in_progress', 'creation', 'needs_input']);
// ...
status: workspace.status === 'review'
  ? 'review'
  : KEEP_CURRENT_STATUSES.has(workspace.status)
    ? workspace.status  // don't reset active statuses
    : 'pending',
```

### 4. Add `cliSessionId` to Stop dedup to prevent cross-run merging

**File**: `apps/server/src/services/eventService.ts`, around line 362

**Problem**: The 60-second dedup window can merge Stops from different CLI sessions (different Claude processes). If a workspace is quickly restarted, the old process's late Stop can merge with the new process's Stop.

**Current dedup query**:
```ts
const recentStop = await prisma.event.findFirst({
  where: {
    sessionId: session.id,
    cliSessionId: payload.session_id,  // This already scopes to same cliSession
    hookEventName: "Stop",
    timestamp: { gte: turnWindowStart },
  },
  ...
});
```

Actually, the dedup already filters by `cliSessionId: payload.session_id`. But verify: does the `cliSessionId` change when the agent is restarted? Check `apps/desktop/src/hooks/useAgentWorkspaceActions.ts` to see if the cliSession is rotated on respawn.

If `cliSessionId` is reused across restarts (the same workspace keeps the same cliSession row), then the dedup can still merge across runs. **Fix**: Add a `runId` or monotonic sequence number to the event payload so dedup only merges within the same run.

If `cliSessionId` is unique per spawn, the current dedup is fine and this task is a no-op.

### 5. Remove client-side `activeRunWorkspaceIds` tracking (web app)

**File**: `apps/web/src/stores/agentRunStore.ts`

The web app currently has `activeRunWorkspaceIds` (or similar) that it manages client-side. This is unreliable because:
- It's set optimistically before the spawn relay completes
- It's cleared only when a `Stop` event arrives via subscription
- If the subscription disconnects, the state is wrong

**Fix**: The web app should derive "is running" entirely from the server-authoritative `workspace.status` and `workspace.cliSession.status`:

```ts
// Helper function — derive running state from server data
export function isWorkspaceRunning(workspace: Workspace): boolean {
  return workspace.status === 'in_progress' || workspace.status === 'creation';
}

export function isWorkspaceActive(workspace: Workspace): boolean {
  return (
    workspace.status === 'in_progress' ||
    workspace.status === 'creation' ||
    workspace.status === 'needs_input'
  );
}
```

Remove:
- `activeRunWorkspaceIds` from `agentRunStore.ts`
- All `addActiveRun()` / `clearActiveRun()` calls in `useChannelSubscriptions.ts`
- The `pendingRunWorkspaceId` pattern (replace with checking `workspace.status === 'pending'` or `workspace.status === 'creation'`)

All components that check "is this workspace running" should use `isWorkspaceRunning(workspace)` instead of checking `activeRunWorkspaceIds.has(workspace.id)`.

### 6. Remove client-side optimistic `cliSession.status` updates (web app)

**File**: `apps/web/src/hooks/useChannelSubscriptions.ts`

The subscription handler for `sessionEventCreated` optimistically sets `cliSession.status` based on events:
```ts
// On Stop event: set cliSession.status = "stopped"
// On non-Stop event: set cliSession.status = "active"
```

**Remove these optimistic updates.** The `workspaceUpserted` subscription already carries the authoritative `cliSession.status` from the server. With Task 1 (every status change broadcasts), the `cliSession.status` will arrive via `workspaceUpserted` within milliseconds of the event.

If there's a brief gap between the event arriving and the workspace broadcast, that's acceptable — it's better than having two competing sources of truth that can diverge.

### 7. Add a `statusUpdatedAt` timestamp to workspace

**Server-side** change to provide the client with a way to detect stale status.

**File**: `apps/server/prisma/schema.prisma`

Add a field to the Workspace model:
```prisma
model Workspace {
  // ... existing fields ...
  statusUpdatedAt DateTime @default(now())
}
```

**File**: `apps/server/src/services/workspaceService.ts`

Update `updateWorkspaceStatus` to set this timestamp:
```ts
await prisma.workspace.update({
  where: { id: workspaceId },
  data: { status, statusUpdatedAt: new Date() },
});
```

**File**: GraphQL schema — expose `statusUpdatedAt` on the `Workspace` type.

This lets the client detect stale data: if a workspace has been `in_progress` for 10+ minutes with no events, the client can show a "possibly stale" indicator instead of a confident green spinner.

### 8. Add server-side heartbeat check for active workspaces

**File**: `apps/server/src/services/ticketService.ts`

The current `reconcileStaleWorkspaces` has two problems:
1. It only runs when the kanban board is queried — if nobody looks at the board, stale workspaces rot
2. The 8-minute stale threshold is arbitrary and too long

**Fix**: Create a lightweight periodic check that runs on a timer:

```ts
// Run every 60 seconds
setInterval(() => {
  void reconcileAllChannels();
}, 60_000);

async function reconcileAllChannels(): Promise<void> {
  // Find ALL workspaces in active states with stale sessions
  const staleWorkspaces = await prisma.workspace.findMany({
    where: {
      status: { in: ['in_progress', 'creation', 'needs_input'] },
      OR: [
        { cliSession: { status: 'stopped', lastSeenAt: { lt: new Date(Date.now() - 30_000) } } },
        { cliSession: { lastSeenAt: { lt: new Date(Date.now() - 5 * 60_000) } } },
      ],
    },
    select: { id: true, status: true, channelId: true },
  });

  for (const ws of staleWorkspaces) {
    const newStatus = ws.status === 'creation' ? 'pending' : 'completed';
    await updateWorkspaceStatus(ws.id, newStatus, ws.channelId);
    void syncTicketWithWorkspaceStatus(ws.id, ws.channelId, newStatus);
  }
}
```

This replaces the lazy reconciliation triggered by board queries with a proactive check. Reduce the stale thresholds:
- CLI session stopped + 30s grace → reconcile (down from 30s, same)
- CLI session silent for 5 minutes → reconcile (down from 8 minutes)

### 9. Handle subscription reconnection on the client

**File**: `apps/web/src/hooks/useChannelSubscriptions.ts`

When the WebSocket subscription disconnects and reconnects, the client may have missed `workspaceUpserted` events. The client should re-fetch all workspace statuses on reconnection.

**Current**: The `subscriptionsActive` flag from `useSyncExternalStore` tracks WebSocket connection state.

**Fix**: Add an effect that triggers a full workspace re-fetch when the subscription reconnects:

```ts
const prevActiveRef = useRef(subscriptionsActive);

useEffect(() => {
  // Detect reconnection: was disconnected, now connected
  if (subscriptionsActive && !prevActiveRef.current) {
    // Re-fetch all workspaces to catch any missed status changes
    refreshWorkspaces();
  }
  prevActiveRef.current = subscriptionsActive;
}, [subscriptionsActive, refreshWorkspaces]);
```

This ensures that even if the subscription was down for minutes, the client catches up on all status changes as soon as it reconnects.

### 10. Simplify the status transition matrix

**File**: `apps/server/src/schema/workspace/resolvers/Mutation/updateWorkspaceStatus.ts`

The current transition matrix allows some questionable transitions and is missing documentation. Add clear comments and tighten the transitions:

```ts
const STATUS_TRANSITIONS: Record<string, string[]> = {
  // Not started yet — can begin creation or start directly
  pending:      ['creation', 'in_progress', 'queued'],
  // Waiting for dependencies — can start when deps are met
  queued:       ['creation', 'in_progress', 'pending'],
  // Worktree being created — can start running or abort back to pending
  creation:     ['in_progress', 'pending'],
  // Agent is actively running — can complete, ask for input, or merge directly
  in_progress:  ['completed', 'needs_input', 'merged'],
  // Waiting for user response — can resume or complete
  needs_input:  ['in_progress', 'completed'],
  // Agent finished — can go to review, merge, or resume
  completed:    ['review', 'merged', 'in_progress'],
  // PR under review — can merge or resume work
  review:       ['merged', 'in_progress'],
  // Terminal state — no transitions out
  merged:       [],
  // Handed off to another user/agent — can restart
  handed_off:   ['creation', 'in_progress'],
};
```

This is mostly documentation, but verify that every transition in the matrix is actually used. Remove any transitions that are never triggered in practice to prevent unexpected state changes.

## Architecture After This Ticket

```
┌─────────────────────────────────────────────────────┐
│                      SERVER                         │
│                                                     │
│  ingestEvent()                                      │
│    ├─ auto-transition (pending→in_progress, etc.)   │
│    └─ updateWorkspaceStatus()                       │
│         ├─ DB write                                 │
│         └─ pubsub.publish(WORKSPACE_UPSERTED) ──────┼──► subscription
│                                                     │
│  updateWorkspaceStatus mutation                     │
│    └─ updateWorkspaceStatus()                       │
│         ├─ DB write                                 │
│         └─ pubsub.publish(WORKSPACE_UPSERTED) ──────┼──► subscription
│                                                     │
│  reconcileAllChannels() (every 60s)                 │
│    └─ updateWorkspaceStatus()                       │
│         ├─ DB write                                 │
│         └─ pubsub.publish(WORKSPACE_UPSERTED) ──────┼──► subscription
│                                                     │
└─────────────────────────────────────────────────────┘
                        │
                  subscription
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                      CLIENT                         │
│                                                     │
│  workspaceUpserted subscription                     │
│    └─ upsertWorkspace(workspace)                    │
│         └─ status comes FROM server, never set      │
│            locally                                  │
│                                                     │
│  isWorkspaceRunning(workspace)                      │
│    └─ derived from workspace.status only            │
│       (no client-side activeRunWorkspaceIds)        │
│                                                     │
│  On subscription reconnect:                         │
│    └─ refreshWorkspaces() to catch missed updates   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Verification

1. `cd apps/server && npx tsc --noEmit` — no type errors
2. `cd apps/web && npx tsc --noEmit` — no type errors
3. `cd apps/server && npx prisma db push` (or equivalent migration) — schema applies
4. Functional test: Spawn an agent, observe status transitions in real-time (pending → creation → in_progress → completed). Each transition should appear within 1-2 seconds.
5. Functional test: Send a follow-up message to a `completed` workspace while watching the status. It should NOT flash "Pending" — it should stay `completed` then transition to `in_progress` when the agent starts.
6. Functional test: Kill an agent process externally (e.g., `kill -9`). Within 60 seconds, the server should reconcile the workspace to `completed`.
7. Functional test: Disconnect the WebSocket (network tab → offline), wait 10 seconds, reconnect. The workspace statuses should immediately refresh to correct values.
8. `grep -r "activeRunWorkspaceIds\|addActiveRun\|clearActiveRun" apps/web/src/` — returns nothing
9. `grep -r "cliSession.status.*=.*stopped\|cliSession.status.*=.*active" apps/web/src/` — returns nothing (no more optimistic cliSession updates)

## Files Changed

### Server
- **Modified**: `apps/server/src/services/workspaceService.ts` (broadcast on status change, fix appendPrompt reset)
- **Modified**: `apps/server/src/services/eventService.ts` (remove redundant broadcasts, pass channelId)
- **Modified**: `apps/server/src/services/ticketService.ts` (proactive reconciliation timer, pass channelId)
- **Modified**: `apps/server/src/schema/workspace/resolvers/Mutation/updateWorkspaceStatus.ts` (documentation)
- **Modified**: `apps/server/prisma/schema.prisma` (add `statusUpdatedAt`)
- **Modified**: GraphQL schema (expose `statusUpdatedAt`)

### Web
- **Modified**: `apps/web/src/stores/agentRunStore.ts` (remove activeRunWorkspaceIds)
- **Modified**: `apps/web/src/hooks/useChannelSubscriptions.ts` (remove optimistic updates, add reconnect handler)
- **Created**: `apps/web/src/lib/workspaceStatus.ts` (isWorkspaceRunning, isWorkspaceActive helpers)
- **Modified**: Any components that checked activeRunWorkspaceIds

## Dependencies
- Independent of Tickets 1-7 (this is server + client plumbing, not UI structure)
- Can be run at ANY point — recommended to run early since it fixes a fundamental UX problem
- If running after Ticket 2 (event bus), the subscription handler changes in Task 6 apply to the event-bus version
