import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";

export type LinkedCheckoutSyncSource = "manual" | "auto";

export interface LinkedCheckoutSyncRequest extends DesktopLinkedCheckoutSyncInput {
  source: LinkedCheckoutSyncSource;
}

interface LinkedCheckoutState {
  statusByRepoId: Record<string, DesktopLinkedCheckoutStatus | null | undefined>;
  pendingByRepoId: Record<string, boolean>;
  queuedSyncByRepoId: Record<string, LinkedCheckoutSyncRequest | null>;
  inFlightSyncByRepoId: Record<
    string,
    Promise<DesktopLinkedCheckoutActionResult> | null | undefined
  >;
  setStatus: (repoId: string, status: DesktopLinkedCheckoutStatus | null) => void;
  setPending: (repoId: string, pending: boolean) => void;
  replaceQueuedSync: (repoId: string, request: LinkedCheckoutSyncRequest | null) => void;
  takeQueuedSync: (repoId: string) => LinkedCheckoutSyncRequest | null;
  getInFlightSync: (
    repoId: string,
  ) => Promise<DesktopLinkedCheckoutActionResult> | null | undefined;
  setInFlightSync: (
    repoId: string,
    promise: Promise<DesktopLinkedCheckoutActionResult> | null,
  ) => void;
}

// This gate is about the local Electron IPC surface, not the desktop/server
// websocket bridge. IPC availability is effectively fixed for the lifetime of
// a renderer, so a static capability check is the right signal here.
function hasLinkedCheckoutDesktopApi(): boolean {
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
  inFlightSyncByRepoId: {},

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

  getInFlightSync: (repoId) => get().inFlightSyncByRepoId[repoId],

  setInFlightSync: (repoId, promise) =>
    set((state) => ({
      inFlightSyncByRepoId: {
        ...state.inFlightSyncByRepoId,
        [repoId]: promise,
      },
    })),
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
  if (!hasLinkedCheckoutDesktopApi()) {
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
    if (!hasLinkedCheckoutDesktopApi()) {
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
      if (!lastResult.ok) {
        useLinkedCheckoutStore.getState().replaceQueuedSync(repoId, null);
        break;
      }
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
  const existingPromise = useLinkedCheckoutStore.getState().getInFlightSync(request.repoId);
  if (existingPromise) {
    useLinkedCheckoutStore.getState().replaceQueuedSync(request.repoId, request);
    return existingPromise;
  }

  const promise = runSyncLoop(request).finally(() => {
    useLinkedCheckoutStore.getState().setInFlightSync(request.repoId, null);
  });
  useLinkedCheckoutStore.getState().setInFlightSync(request.repoId, promise);
  return promise;
}

export function scheduleAutoSyncLinkedCheckout(request: LinkedCheckoutSyncRequest): void {
  const existingPromise = useLinkedCheckoutStore.getState().getInFlightSync(request.repoId);
  if (existingPromise) {
    useLinkedCheckoutStore.getState().replaceQueuedSync(request.repoId, request);
    return;
  }

  void syncLinkedCheckout(request).then((result) => {
    if (!result.ok && result.error) {
      toast.error("Auto-sync paused", {
        description: result.error,
      });
    }
  }).catch((error) => {
    toast.error("Auto-sync paused", {
      description: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function restoreLinkedCheckout(
  repoId: string,
): Promise<DesktopLinkedCheckoutActionResult> {
  if (isLinkedCheckoutPending(repoId)) {
    throw new Error("A root checkout sync is already in progress.");
  }

  if (!hasLinkedCheckoutDesktopApi()) {
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

  if (!hasLinkedCheckoutDesktopApi()) {
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
    hasDesktopApi: hasLinkedCheckoutDesktopApi(),
  };
}
