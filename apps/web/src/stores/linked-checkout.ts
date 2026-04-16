import { useEffect } from "react";
import { create } from "zustand";

export type LinkedCheckoutSyncSource = "manual" | "auto";

export interface LinkedCheckoutSyncRequest extends DesktopLinkedCheckoutSyncInput {
  source: LinkedCheckoutSyncSource;
}

interface LinkedCheckoutState {
  statusByRepoId: Record<string, DesktopLinkedCheckoutStatus | null | undefined>;
  pendingByRepoId: Record<string, boolean>;
  queuedSyncByRepoId: Record<string, LinkedCheckoutSyncRequest | null>;
  setStatus: (repoId: string, status: DesktopLinkedCheckoutStatus | null) => void;
  setPending: (repoId: string, pending: boolean) => void;
  replaceQueuedSync: (repoId: string, request: LinkedCheckoutSyncRequest | null) => void;
  takeQueuedSync: (repoId: string) => LinkedCheckoutSyncRequest | null;
}

const syncPromises = new Map<string, Promise<DesktopLinkedCheckoutActionResult>>();

function isBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.trace?.getLinkedCheckoutStatus === "function" &&
    typeof window.trace?.syncLinkedCheckout === "function" &&
    typeof window.trace?.restoreLinkedCheckout === "function" &&
    typeof window.trace?.setLinkedCheckoutAutoSync === "function"
  );
}

function emptyStatus(repoId: string): DesktopLinkedCheckoutStatus {
  return {
    repoId,
    repoPath: null,
    isAttached: false,
    attachedSessionGroupId: null,
    targetBranch: null,
    autoSyncEnabled: false,
    currentBranch: null,
    currentCommitSha: null,
    lastSyncedCommitSha: null,
    lastSyncError: null,
    restoreBranch: null,
    restoreCommitSha: null,
  };
}

function bridgeUnavailableError(): Error {
  return new Error("Root checkout sync is only available in Trace Desktop.");
}

export const useLinkedCheckoutStore = create<LinkedCheckoutState>((set, get) => ({
  statusByRepoId: {},
  pendingByRepoId: {},
  queuedSyncByRepoId: {},

  setStatus: (repoId, status) =>
    set((state) => ({
      statusByRepoId: {
        ...state.statusByRepoId,
        [repoId]: status,
      },
    })),

  setPending: (repoId, pending) =>
    set((state) => ({
      pendingByRepoId: {
        ...state.pendingByRepoId,
        [repoId]: pending,
      },
    })),

  replaceQueuedSync: (repoId, request) =>
    set((state) => ({
      queuedSyncByRepoId: {
        ...state.queuedSyncByRepoId,
        [repoId]: request,
      },
    })),

  takeQueuedSync: (repoId) => {
    const queued = get().queuedSyncByRepoId[repoId] ?? null;
    set((state) => ({
      queuedSyncByRepoId: {
        ...state.queuedSyncByRepoId,
        [repoId]: null,
      },
    }));
    return queued;
  },
}));

export function isLinkedCheckoutPending(repoId: string | null | undefined): boolean {
  if (!repoId) return false;
  return useLinkedCheckoutStore.getState().pendingByRepoId[repoId] ?? false;
}

export function getLinkedCheckoutStatusSnapshot(
  repoId: string | null | undefined,
): DesktopLinkedCheckoutStatus | null | undefined {
  if (!repoId) return null;
  return useLinkedCheckoutStore.getState().statusByRepoId[repoId];
}

export async function refreshLinkedCheckoutStatus(
  repoId: string,
): Promise<DesktopLinkedCheckoutStatus | null> {
  if (!isBridgeAvailable()) {
    useLinkedCheckoutStore.getState().setStatus(repoId, null);
    return null;
  }

  const status = await window.trace!.getLinkedCheckoutStatus(repoId);
  useLinkedCheckoutStore.getState().setStatus(repoId, status);
  return status;
}

export async function ensureLinkedCheckoutStatus(
  repoId: string,
): Promise<DesktopLinkedCheckoutStatus | null> {
  const current = getLinkedCheckoutStatusSnapshot(repoId);
  if (current !== undefined) {
    return current ?? null;
  }
  return refreshLinkedCheckoutStatus(repoId);
}

async function runSyncLoop(
  initialRequest: LinkedCheckoutSyncRequest,
): Promise<DesktopLinkedCheckoutActionResult> {
  const repoId = initialRequest.repoId;
  const store = useLinkedCheckoutStore.getState();

  store.setPending(repoId, true);

  let nextRequest: LinkedCheckoutSyncRequest | null = initialRequest;
  let lastResult: DesktopLinkedCheckoutActionResult = {
    ok: false,
    error: "No sync was executed.",
    status: emptyStatus(repoId),
  };

  try {
    if (!isBridgeAvailable()) {
      throw bridgeUnavailableError();
    }

    while (nextRequest) {
      lastResult = await window.trace!.syncLinkedCheckout({
        repoId: nextRequest.repoId,
        sessionGroupId: nextRequest.sessionGroupId,
        branch: nextRequest.branch,
        commitSha: nextRequest.commitSha,
        autoSyncEnabled: nextRequest.autoSyncEnabled,
      });
      useLinkedCheckoutStore.getState().setStatus(repoId, lastResult.status);
      nextRequest = useLinkedCheckoutStore.getState().takeQueuedSync(repoId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = (await refreshLinkedCheckoutStatus(repoId).catch(() => null)) ?? emptyStatus(repoId);
    lastResult = {
      ok: false,
      error: message,
      status,
    };
    useLinkedCheckoutStore.getState().setStatus(repoId, status);
    useLinkedCheckoutStore.getState().replaceQueuedSync(repoId, null);
  } finally {
    useLinkedCheckoutStore.getState().setPending(repoId, false);
  }

  return lastResult;
}

export async function syncLinkedCheckout(
  request: LinkedCheckoutSyncRequest,
): Promise<DesktopLinkedCheckoutActionResult> {
  const existingPromise = syncPromises.get(request.repoId);
  if (existingPromise) {
    useLinkedCheckoutStore.getState().replaceQueuedSync(request.repoId, request);
    return existingPromise;
  }

  const promise = runSyncLoop(request).finally(() => {
    syncPromises.delete(request.repoId);
  });
  syncPromises.set(request.repoId, promise);
  return promise;
}

export async function restoreLinkedCheckout(
  repoId: string,
): Promise<DesktopLinkedCheckoutActionResult> {
  if (isLinkedCheckoutPending(repoId)) {
    throw new Error("A root checkout sync is already in progress.");
  }

  if (!isBridgeAvailable()) {
    throw bridgeUnavailableError();
  }

  useLinkedCheckoutStore.getState().setPending(repoId, true);
  try {
    const result = await window.trace!.restoreLinkedCheckout(repoId);
    useLinkedCheckoutStore.getState().setStatus(repoId, result.status);
    return result;
  } finally {
    useLinkedCheckoutStore.getState().setPending(repoId, false);
  }
}

export async function setLinkedCheckoutAutoSync(
  repoId: string,
  enabled: boolean,
): Promise<DesktopLinkedCheckoutActionResult> {
  if (isLinkedCheckoutPending(repoId)) {
    throw new Error("A root checkout sync is already in progress.");
  }

  if (!isBridgeAvailable()) {
    throw bridgeUnavailableError();
  }

  useLinkedCheckoutStore.getState().setPending(repoId, true);
  try {
    const result = await window.trace!.setLinkedCheckoutAutoSync(repoId, enabled);
    useLinkedCheckoutStore.getState().setStatus(repoId, result.status);
    return result;
  } finally {
    useLinkedCheckoutStore.getState().setPending(repoId, false);
  }
}

export function useLinkedCheckoutStatus(repoId: string | null | undefined) {
  const status = useLinkedCheckoutStore((state) => (repoId ? state.statusByRepoId[repoId] : null));
  const pending = useLinkedCheckoutStore(
    (state) => (repoId ? state.pendingByRepoId[repoId] ?? false : false),
  );

  useEffect(() => {
    if (!repoId) return;
    void ensureLinkedCheckoutStatus(repoId);
  }, [repoId]);

  return {
    status: status ?? null,
    pending,
    isDesktopAvailable: isBridgeAvailable(),
  };
}
