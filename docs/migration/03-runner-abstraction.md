# Ticket 3: Runner Abstraction

## Goal
Create a `RunnerAdapter` interface that decouples relay hooks from the specific transport mechanism. Implement `ServerRelayAdapter` around the existing browser → server → Electron path and rewire all 6 relay hooks to use the new abstraction. The purpose is not to bypass Electron; it is to keep Electron as a first-class runtime without hardwiring browser code to one transport.

## Context

### Current Architecture
Every relay hook follows this pattern:
```ts
export function useXxxRelay() {
  const { relayAction } = useInstance();
  const someAction = useCallback(
    (params) => typedRelay<ResultType>(relayAction, "actionName", params),
    [relayAction],
  );
  return { someAction };
}
```

`useInstance()` comes from `InstanceContext.tsx`, which provides:
- `relayAction(action, params)` → calls GraphQL `RelayAction` mutation → server forwards to Electron via WebSocket

The problem: every relay hook is tightly coupled to the GraphQL-mutation-through-server transport. We want the web app to depend on an execution interface, not the transport details. The primary production path is:
- **ServerRelayAdapter**: Browser → Server → Electron (existing double-hop, works today, remains the main path)

The abstraction may support additional server-mediated execution strategies later, but **do not** design this ticket around bypassing Electron.

### The `typedRelay` function
In `apps/web/src/hooks/relay/useRelayAction.ts`:
```ts
export async function typedRelay<TData = void>(
  relayAction: RelayActionFn,
  actionName: string,
  params: Record<string, unknown> | object,
): Promise<RelayResult<TData>> {
  const result = await relayAction(actionName, params);
  return { success: result.success, data: result.data as TData | undefined, error: result.error ?? undefined };
}
```

The `RelayResult<T>` type is already the right shape for our adapter interface.

### Relay hooks to migrate (6 files)
All in `apps/web/src/hooks/relay/`:
1. `useAgentRelay.ts` — spawnAgent, stopAgent, detectAgents, reportAgentActivity
2. `useWorktreeRelay.ts` — deleteWorktree, checkWorktreeExists, mergeWorktree, commitWorktreeChanges, getWorktreeDiff, getWorktreeBranch
3. `useGitRelay.ts` — listRepoBranches, checkBranchesMerged, checkMainStatus, pullMain, createGitBranch
4. `useGitHubRelay.ts` — checkGhAuth, pushWorktreeBranch, ensureWorktreeFromRemote, checkPRStatusesLocal, checkPRCILocal, listPullRequests, checkoutPullRequest, detectInstalledApps, openInApp
5. `useRepoRelay.ts` — listRepoFiles, suggestScripts, validateRepo, listSlashCommands, readProductDocFile, writeProductDocFile
6. `useMiscRelay.ts` — getLocalConfig, setLocalConfig, getAllLocalConfigs, deleteLocalConfig, getGlobalConfig, setGlobalConfig, allocatePorts, releasePorts, checkRunningProcesses

## Tasks

### 1. Create `apps/web/src/features/runner/types.ts`

```ts
import type { RelayResult } from '../../hooks/relay/useRelayAction';

export type RunnerStatus = 'connected' | 'connecting' | 'disconnected';

export interface RunnerAdapter {
  /** Current connection status */
  readonly status: RunnerStatus;

  /**
   * Execute a relay action. This is the core method — all relay hooks call this.
   * The adapter decides the transport (GraphQL mutation, server orchestration, etc.)
   */
  execute<T = void>(
    action: string,
    params: Record<string, unknown>,
  ): Promise<RelayResult<T>>;

  /** Subscribe to status changes. Returns an unsubscribe function. */
  onStatusChange(cb: (status: RunnerStatus) => void): () => void;
}
```

### 2. Create `apps/web/src/features/runner/adapters/ServerRelayAdapter.ts`

This wraps the existing GraphQL relay mutation — the same path that exists today.

```ts
import type { RunnerAdapter, RunnerStatus } from '../types';
import type { RelayResult } from '../../../hooks/relay/useRelayAction';

type ExecuteRelayFn = (variables: {
  variables: { instanceId: string; action: string; params: Record<string, unknown> };
}) => Promise<{
  data?: { relayAction: { success: boolean; data?: unknown; error?: string | null } } | null;
  errors?: Array<{ message: string }>;
}>;

export class ServerRelayAdapter implements RunnerAdapter {
  private _status: RunnerStatus;
  private listeners = new Set<(s: RunnerStatus) => void>();

  constructor(
    private executeRelay: ExecuteRelayFn,
    private getInstanceId: () => string | null,
    initialStatus: RunnerStatus = 'disconnected',
  ) {
    this._status = initialStatus;
  }

  get status(): RunnerStatus {
    return this._status;
  }

  setStatus(status: RunnerStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.listeners.forEach((cb) => cb(status));
  }

  async execute<T = void>(
    action: string,
    params: Record<string, unknown>,
  ): Promise<RelayResult<T>> {
    const instanceId = this.getInstanceId();
    if (!instanceId) {
      return { success: false, data: undefined, error: 'Not connected to an instance' };
    }

    try {
      const { data, errors } = await this.executeRelay({
        variables: { instanceId, action, params },
      });

      if (errors?.length) {
        return { success: false, data: undefined, error: errors[0].message };
      }

      const relay = data?.relayAction;
      if (!relay) {
        return { success: false, data: undefined, error: 'No relay response' };
      }

      return {
        success: relay.success,
        data: relay.data as T | undefined,
        error: relay.error ?? undefined,
      };
    } catch (err) {
      return {
        success: false,
        data: undefined,
        error: err instanceof Error ? err.message : 'Unknown relay error',
      };
    }
  }

  onStatusChange(cb: (s: RunnerStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
```

### 3. Create `apps/web/src/features/runner/RunnerContext.tsx`

```ts
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { RunnerAdapter } from './types';
import { ServerRelayAdapter } from './adapters/ServerRelayAdapter';
import { useInstance } from '../../context/InstanceContext';
import { useRelayActionMutation } from '../../context/__generated__/InstanceContext.generated';
import { useInstanceStore } from '../../stores/instanceStore';

// A noop adapter for when no runner is available
const DISCONNECTED_ADAPTER: RunnerAdapter = {
  status: 'disconnected',
  async execute() {
    return { success: false, data: undefined, error: 'No runner connected' };
  },
  onStatusChange() {
    return () => {};
  },
};

const RunnerContext = createContext<RunnerAdapter>(DISCONNECTED_ADAPTER);

export function RunnerProvider({ children }: { children: ReactNode }) {
  const { instanceStatus } = useInstance();
  const [executeRelay] = useRelayActionMutation();

  const adapterRef = useRef<ServerRelayAdapter | null>(null);

  const adapter = useMemo(() => {
    const relay = new ServerRelayAdapter(
      executeRelay,
      () => useInstanceStore.getState().connectedInstanceId,
      instanceStatus === 'connected' ? 'connected' : 'disconnected',
    );
    adapterRef.current = relay;
    return relay;
  }, [executeRelay]);

  // Sync instance status → adapter status
  useEffect(() => {
    if (adapterRef.current) {
      adapterRef.current.setStatus(
        instanceStatus === 'connected' ? 'connected' : instanceStatus === 'connecting' ? 'connecting' : 'disconnected',
      );
    }
  }, [instanceStatus]);

  return (
    <RunnerContext.Provider value={adapter}>
      {children}
    </RunnerContext.Provider>
  );
}

export function useRunner(): RunnerAdapter {
  return useContext(RunnerContext);
}
```

### 4. Wire `RunnerProvider` into the app

**File**: `apps/web/src/App.tsx`

Add `RunnerProvider` inside `InstanceProvider`:

```tsx
import { RunnerProvider } from './features/runner/RunnerContext';

function ProtectedRoutes() {
  return (
    <InstanceProvider>
      <RunnerProvider>
        <Routes>
          <Route path="/" element={<InstancePickerPage />} />
          <Route
            path="/i/:instanceId"
            element={
              <ChannelProvider>
                <WorkspacePage />
              </ChannelProvider>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RunnerProvider>
    </InstanceProvider>
  );
}
```

### 5. Migrate all 6 relay hooks

Each hook changes from:
```ts
const { relayAction } = useInstance();
// ...
typedRelay<T>(relayAction, "actionName", params)
```

To:
```ts
import { useRunner } from '../../features/runner/RunnerContext';
// ...
const runner = useRunner();
// ...
runner.execute<T>("actionName", params)
```

**Example — `useWorktreeRelay.ts` becomes:**
```ts
import { useCallback } from "react";
import { useRunner } from "../../features/runner/RunnerContext";
import type {
  DeleteWorktreeParams, DeleteWorktreeResult,
  CheckWorktreeExistsParams, CheckWorktreeExistsResult,
  MergeWorktreeParams, MergeWorktreeResult,
  CommitWorktreeChangesParams, CommitWorktreeChangesResult,
  GetWorktreeDiffParams, GetWorktreeDiffResult,
  GetWorktreeBranchParams, GetWorktreeBranchResult,
} from "./types";

export function useWorktreeRelay() {
  const runner = useRunner();

  const deleteWorktree = useCallback(
    (params: DeleteWorktreeParams) =>
      runner.execute<DeleteWorktreeResult>("deleteWorktree", params),
    [runner],
  );

  const checkWorktreeExists = useCallback(
    (params: CheckWorktreeExistsParams) =>
      runner.execute<CheckWorktreeExistsResult>("checkWorktreeExists", params),
    [runner],
  );

  // ... same pattern for all other actions

  return { deleteWorktree, checkWorktreeExists, /* ... */ };
}
```

Apply this pattern to all 6 files:
- `useAgentRelay.ts` — note: `spawnAgent` currently restructures params before calling typedRelay. Keep that restructuring, just change the final call.
- `useWorktreeRelay.ts` — straightforward 1:1
- `useGitRelay.ts` — straightforward 1:1
- `useGitHubRelay.ts` — straightforward 1:1
- `useRepoRelay.ts` — straightforward 1:1
- `useMiscRelay.ts` — straightforward 1:1

### 6. Clean up `useRelayAction.ts`

After migration, `typedRelay` is no longer called by any relay hook. However, keep the file for now — its `RelayResult` type is still used by the adapter types. You can remove the `typedRelay` function and `RelayActionFn` type, but **keep the `RelayResult` interface** (or move it to `features/runner/types.ts`).

### 7. Clean up `InstanceContext.tsx`

After migration, relay hooks no longer call `useInstance()` for `relayAction`. The only remaining consumers of `useInstance()` should be:
- `RunnerContext.tsx` (to build the adapter)
- `InstancePickerPage.tsx` (for `connectToInstance`)
- `InstancePasswordModal.tsx` (for `connectToInstance`)
- Components that need `connectedInstanceId` or `instanceStatus`

The `relayAction` function should remain on `InstanceContext` for now since `RunnerContext` uses it internally. But relay hooks should NOT import from `InstanceContext` anymore.

Verify: `grep -r "useInstance()" apps/web/src/hooks/relay/` should return zero results.

### 8. Document extension points, but do not add speculative adapters

Do **not** create a `DirectAdapter` stub. It adds conceptual surface area without a committed product path.

Instead:

- keep `RunnerAdapter` narrowly defined around `execute()` and status tracking
- document in code comments that `ServerRelayAdapter` is the default production implementation
- leave room for future adapters only when a real execution path exists and has product justification

## Verification

1. `cd apps/web && npx tsc --noEmit` — no type errors
2. `cd apps/web && npx vite build` — builds successfully
3. `grep -r "useInstance()" apps/web/src/hooks/relay/` — returns nothing
4. `grep -r "typedRelay" apps/web/src/hooks/relay/` — returns nothing (only in useRelayAction.ts if kept)
5. Functional test: Connect to an instance, open a workspace, send a message (triggers spawnAgent relay) — should work exactly as before
6. Functional test: Open the changes tab (triggers getWorktreeDiff relay) — should work
7. Functional test: Disconnect instance, verify relay calls return appropriate errors

## Files Changed
- **Created**: `apps/web/src/features/runner/types.ts`, `apps/web/src/features/runner/RunnerContext.tsx`, `apps/web/src/features/runner/adapters/ServerRelayAdapter.ts`
- **Modified**: `apps/web/src/App.tsx` (add RunnerProvider), all 6 `apps/web/src/hooks/relay/use*Relay.ts` files, `apps/web/src/hooks/relay/useRelayAction.ts` (cleanup)

## Dependencies
- Requires Ticket 1 (needs `features/runner/` directory to exist)
- Independent of Ticket 2 (no interaction with syncActions/workspaceActions)
