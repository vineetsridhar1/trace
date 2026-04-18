import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import type { DocumentInput } from "@urql/core";
import { client } from "../lib/urql";
import {
  LINKED_CHECKOUT_STATUS_QUERY,
  LINK_LINKED_CHECKOUT_REPO_MUTATION,
  RESTORE_LINKED_CHECKOUT_MUTATION,
  SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION,
  SYNC_LINKED_CHECKOUT_MUTATION,
} from "../lib/mutations";

export type LinkedCheckoutSyncSource = "manual" | "auto";

export interface LinkedCheckoutSyncRequest extends DesktopLinkedCheckoutSyncInput {
  runtimeInstanceId: string;
  source: LinkedCheckoutSyncSource;
}

interface AutoSyncBlockState {
  retryAt: number;
}

type LinkedCheckoutQueryData = {
  linkedCheckoutStatus?: DesktopLinkedCheckoutStatus | null;
};

type LinkedCheckoutMutationField =
  | "linkLinkedCheckoutRepo"
  | "syncLinkedCheckout"
  | "restoreLinkedCheckout"
  | "setLinkedCheckoutAutoSync";

type LinkedCheckoutMutationData = Partial<
  Record<LinkedCheckoutMutationField, DesktopLinkedCheckoutActionResult | null>
>;

interface LinkedCheckoutState {
  statusByKey: Record<string, DesktopLinkedCheckoutStatus | null | undefined>;
  pendingByKey: Record<string, boolean>;
  queuedSyncByKey: Record<string, LinkedCheckoutSyncRequest | null>;
  inFlightSyncByKey: Record<string, Promise<DesktopLinkedCheckoutActionResult> | null | undefined>;
  autoSyncBlockByKey: Record<string, AutoSyncBlockState | null | undefined>;
  setStatus: (key: string, status: DesktopLinkedCheckoutStatus | null) => void;
  setPending: (key: string, pending: boolean) => void;
  replaceQueuedSync: (key: string, request: LinkedCheckoutSyncRequest | null) => void;
  takeQueuedSync: (key: string) => LinkedCheckoutSyncRequest | null;
  getInFlightSync: (key: string) => Promise<DesktopLinkedCheckoutActionResult> | null | undefined;
  getAutoSyncBlock: (key: string) => AutoSyncBlockState | null | undefined;
  setAutoSyncBlock: (key: string, block: AutoSyncBlockState | null) => void;
  setInFlightSync: (
    key: string,
    promise: Promise<DesktopLinkedCheckoutActionResult> | null,
  ) => void;
}

const AUTO_SYNC_FAILURE_COOLDOWN_MS = 30_000;

function hasLinkedCheckoutPicker(): boolean {
  return typeof window !== "undefined" && typeof window.trace?.pickFolder === "function";
}

function getStoreKey(
  repoId: string | null | undefined,
  runtimeInstanceId: string | null | undefined,
): string | null {
  if (!repoId || !runtimeInstanceId) return null;
  // Linked-checkout state lives on a specific local bridge, not just on the repo.
  return `${runtimeInstanceId}:${repoId}`;
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

async function queryLinkedCheckoutStatus(
  sessionGroupId: string,
  repoId: string,
): Promise<DesktopLinkedCheckoutStatus | null> {
  const result = await client
    .query(
      LINKED_CHECKOUT_STATUS_QUERY,
      { sessionGroupId, repoId },
      { requestPolicy: "network-only" },
    )
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  return (result.data as LinkedCheckoutQueryData | undefined)?.linkedCheckoutStatus ?? null;
}

async function runLinkedCheckoutMutation(
  document: DocumentInput<LinkedCheckoutMutationData, Record<string, unknown>>,
  field: LinkedCheckoutMutationField,
  variables: Record<string, unknown>,
): Promise<DesktopLinkedCheckoutActionResult> {
  const result = await client.mutation(document, variables).toPromise();
  if (result.error) {
    throw result.error;
  }

  const payload = (result.data as LinkedCheckoutMutationData | undefined)?.[field];
  if (!payload) {
    throw new Error("Linked checkout action returned no result.");
  }

  return payload;
}

export const useLinkedCheckoutStore = create<LinkedCheckoutState>((set, get) => ({
  statusByKey: {},
  pendingByKey: {},
  queuedSyncByKey: {},
  inFlightSyncByKey: {},
  autoSyncBlockByKey: {},

  setStatus: (key, status) =>
    set((state) => {
      const nextState: Partial<LinkedCheckoutState> = {
        statusByKey: {
          ...state.statusByKey,
          [key]: status,
        },
      };

      const currentBlock = state.autoSyncBlockByKey[key];
      const shouldClearBlock =
        !!currentBlock && (!status || !status.isAttached || !status.autoSyncEnabled);

      if (shouldClearBlock) {
        nextState.autoSyncBlockByKey = {
          ...state.autoSyncBlockByKey,
          [key]: null,
        };
      }

      return nextState;
    }),

  setPending: (key, pending) =>
    set((state) => ({
      pendingByKey: {
        ...state.pendingByKey,
        [key]: pending,
      },
    })),

  replaceQueuedSync: (key, request) =>
    set((state) => ({
      queuedSyncByKey: {
        ...state.queuedSyncByKey,
        [key]: request,
      },
    })),

  takeQueuedSync: (key) => {
    const queued = get().queuedSyncByKey[key] ?? null;
    set((state) => ({
      queuedSyncByKey: {
        ...state.queuedSyncByKey,
        [key]: null,
      },
    }));
    return queued;
  },

  getInFlightSync: (key) => get().inFlightSyncByKey[key],

  getAutoSyncBlock: (key) => get().autoSyncBlockByKey[key],

  setAutoSyncBlock: (key, block) =>
    set((state) => ({
      autoSyncBlockByKey: {
        ...state.autoSyncBlockByKey,
        [key]: block,
      },
    })),

  setInFlightSync: (key, promise) =>
    set((state) => ({
      inFlightSyncByKey: {
        ...state.inFlightSyncByKey,
        [key]: promise,
      },
    })),
}));

export function isLinkedCheckoutPending(
  repoId: string | null | undefined,
  runtimeInstanceId: string | null | undefined,
): boolean {
  const key = getStoreKey(repoId, runtimeInstanceId);
  if (!key) return false;
  return useLinkedCheckoutStore.getState().pendingByKey[key] ?? false;
}

export function getLinkedCheckoutStatusSnapshot(
  repoId: string | null | undefined,
  runtimeInstanceId: string | null | undefined,
): DesktopLinkedCheckoutStatus | null | undefined {
  const key = getStoreKey(repoId, runtimeInstanceId);
  if (!key) return null;
  return useLinkedCheckoutStore.getState().statusByKey[key];
}

export async function refreshLinkedCheckoutStatus(
  repoId: string,
  sessionGroupId: string,
  runtimeInstanceId: string,
): Promise<DesktopLinkedCheckoutStatus | null> {
  const key = getStoreKey(repoId, runtimeInstanceId);
  if (!key) return null;

  try {
    const status = await queryLinkedCheckoutStatus(sessionGroupId, repoId);
    useLinkedCheckoutStore.getState().setStatus(key, status);
    return status;
  } catch (error) {
    useLinkedCheckoutStore.getState().setStatus(key, null);
    throw error;
  }
}

export async function ensureLinkedCheckoutStatus(
  repoId: string,
  sessionGroupId: string,
  runtimeInstanceId: string,
): Promise<DesktopLinkedCheckoutStatus | null> {
  const current = getLinkedCheckoutStatusSnapshot(repoId, runtimeInstanceId);
  if (current !== undefined) {
    return current ?? null;
  }
  return refreshLinkedCheckoutStatus(repoId, sessionGroupId, runtimeInstanceId);
}

export async function linkLinkedCheckoutRepo(
  sessionGroupId: string,
  repoId: string,
  localPath: string,
  runtimeInstanceId: string,
): Promise<DesktopLinkedCheckoutActionResult> {
  const key = getStoreKey(repoId, runtimeInstanceId);
  if (!key) {
    throw new Error("Missing linked checkout session group, repo, or runtime.");
  }

  useLinkedCheckoutStore.getState().setPending(key, true);
  try {
    const result = await runLinkedCheckoutMutation(
      LINK_LINKED_CHECKOUT_REPO_MUTATION,
      "linkLinkedCheckoutRepo",
      {
        sessionGroupId,
        repoId,
        localPath,
      },
    );
    useLinkedCheckoutStore.getState().setStatus(key, result.status);
    return result;
  } finally {
    useLinkedCheckoutStore.getState().setPending(key, false);
  }
}

async function runSyncLoop(
  initialRequest: LinkedCheckoutSyncRequest,
): Promise<DesktopLinkedCheckoutActionResult> {
  const key = getStoreKey(initialRequest.repoId, initialRequest.runtimeInstanceId);
  if (!key) {
    throw new Error("Missing linked checkout session group, repo, or runtime.");
  }

  const store = useLinkedCheckoutStore.getState();
  store.setPending(key, true);
  if (initialRequest.source === "manual") {
    store.setAutoSyncBlock(key, null);
  }

  let nextRequest: LinkedCheckoutSyncRequest | null = initialRequest;
  // The loop always runs at least once because nextRequest starts as
  // initialRequest, so this default is only assigned to satisfy the type checker.
  let lastResult!: DesktopLinkedCheckoutActionResult;

  try {
    while (nextRequest) {
      lastResult = await runLinkedCheckoutMutation(
        SYNC_LINKED_CHECKOUT_MUTATION,
        "syncLinkedCheckout",
        {
          sessionGroupId: nextRequest.sessionGroupId,
          repoId: nextRequest.repoId,
          branch: nextRequest.branch,
          commitSha: nextRequest.commitSha,
          autoSyncEnabled: nextRequest.autoSyncEnabled,
        },
      );
      useLinkedCheckoutStore.getState().setStatus(key, lastResult.status);
      if (!lastResult.ok) {
        if (nextRequest.source === "auto") {
          useLinkedCheckoutStore.getState().setAutoSyncBlock(key, {
            retryAt: Date.now() + AUTO_SYNC_FAILURE_COOLDOWN_MS,
          });
        }
        useLinkedCheckoutStore.getState().replaceQueuedSync(key, null);
        break;
      }
      useLinkedCheckoutStore.getState().setAutoSyncBlock(key, null);
      nextRequest = useLinkedCheckoutStore.getState().takeQueuedSync(key);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      (await refreshLinkedCheckoutStatus(
        initialRequest.repoId,
        initialRequest.sessionGroupId,
        initialRequest.runtimeInstanceId,
      ).catch(() => null)) ?? emptyStatus(initialRequest.repoId);
    lastResult = {
      ok: false,
      error: message,
      status,
    };
    useLinkedCheckoutStore.getState().setStatus(key, status);
    if (nextRequest?.source === "auto") {
      useLinkedCheckoutStore.getState().setAutoSyncBlock(key, {
        retryAt: Date.now() + AUTO_SYNC_FAILURE_COOLDOWN_MS,
      });
    }
    useLinkedCheckoutStore.getState().replaceQueuedSync(key, null);
  } finally {
    useLinkedCheckoutStore.getState().setPending(key, false);
  }

  return lastResult;
}

export async function syncLinkedCheckout(
  request: LinkedCheckoutSyncRequest,
): Promise<DesktopLinkedCheckoutActionResult> {
  const key = getStoreKey(request.repoId, request.runtimeInstanceId);
  if (!key) {
    throw new Error("Missing linked checkout session group, repo, or runtime.");
  }

  const existingPromise = useLinkedCheckoutStore.getState().getInFlightSync(key);
  if (existingPromise) {
    useLinkedCheckoutStore.getState().replaceQueuedSync(key, request);
    return existingPromise;
  }

  const promise = runSyncLoop(request).finally(() => {
    useLinkedCheckoutStore.getState().setInFlightSync(key, null);
  });
  useLinkedCheckoutStore.getState().setInFlightSync(key, promise);
  return promise;
}

export function scheduleAutoSyncLinkedCheckout(request: LinkedCheckoutSyncRequest): void {
  const key = getStoreKey(request.repoId, request.runtimeInstanceId);
  if (!key) return;

  const autoSyncBlock = useLinkedCheckoutStore.getState().getAutoSyncBlock(key);
  if (autoSyncBlock && autoSyncBlock.retryAt > Date.now()) {
    return;
  }

  const existingPromise = useLinkedCheckoutStore.getState().getInFlightSync(key);
  if (existingPromise) {
    useLinkedCheckoutStore.getState().replaceQueuedSync(key, request);
    return;
  }

  void syncLinkedCheckout(request)
    .then((result) => {
      if (!result.ok && result.error) {
        toast.error("Auto-sync paused", {
          description: result.error,
        });
      }
    })
    .catch((error) => {
      toast.error("Auto-sync paused", {
        description: error instanceof Error ? error.message : String(error),
      });
    });
}

export async function restoreLinkedCheckout(
  repoId: string,
  sessionGroupId: string,
  runtimeInstanceId: string,
): Promise<DesktopLinkedCheckoutActionResult> {
  const key = getStoreKey(repoId, runtimeInstanceId);
  if (!key) {
    throw new Error("Missing linked checkout session group, repo, or runtime.");
  }

  if (isLinkedCheckoutPending(repoId, runtimeInstanceId)) {
    throw new Error("A linked checkout sync is already in progress.");
  }

  useLinkedCheckoutStore.getState().setPending(key, true);
  useLinkedCheckoutStore.getState().setAutoSyncBlock(key, null);
  try {
    const result = await runLinkedCheckoutMutation(
      RESTORE_LINKED_CHECKOUT_MUTATION,
      "restoreLinkedCheckout",
      {
        sessionGroupId,
        repoId,
      },
    );
    useLinkedCheckoutStore.getState().setStatus(key, result.status);
    return result;
  } finally {
    useLinkedCheckoutStore.getState().setPending(key, false);
  }
}

export async function setLinkedCheckoutAutoSync(
  repoId: string,
  sessionGroupId: string,
  enabled: boolean,
  runtimeInstanceId: string,
): Promise<DesktopLinkedCheckoutActionResult> {
  const key = getStoreKey(repoId, runtimeInstanceId);
  if (!key) {
    throw new Error("Missing linked checkout session group, repo, or runtime.");
  }

  if (isLinkedCheckoutPending(repoId, runtimeInstanceId)) {
    throw new Error("A linked checkout sync is already in progress.");
  }

  useLinkedCheckoutStore.getState().setPending(key, true);
  try {
    const result = await runLinkedCheckoutMutation(
      SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION,
      "setLinkedCheckoutAutoSync",
      {
        sessionGroupId,
        repoId,
        enabled,
      },
    );
    useLinkedCheckoutStore.getState().setStatus(key, result.status);
    useLinkedCheckoutStore.getState().setAutoSyncBlock(key, null);
    return result;
  } finally {
    useLinkedCheckoutStore.getState().setPending(key, false);
  }
}

export function useLinkedCheckoutStatus(
  repoId: string | null | undefined,
  sessionGroupId: string | null | undefined,
  runtimeInstanceId: string | null | undefined,
  enabled = true,
) {
  const key = enabled ? getStoreKey(repoId, runtimeInstanceId) : null;
  const status = useLinkedCheckoutStore((state) => (key ? state.statusByKey[key] : null));
  const pending = useLinkedCheckoutStore((state) =>
    key ? (state.pendingByKey[key] ?? false) : false,
  );
  const loaded = useLinkedCheckoutStore((state) =>
    key ? state.statusByKey[key] !== undefined : false,
  );

  useEffect(() => {
    if (!enabled || !repoId || !sessionGroupId || !runtimeInstanceId) return;
    void ensureLinkedCheckoutStatus(repoId, sessionGroupId, runtimeInstanceId).catch(() => {});
  }, [enabled, repoId, runtimeInstanceId, sessionGroupId]);

  return {
    status: enabled ? (status ?? null) : null,
    pending: enabled ? pending : false,
    loaded: enabled ? loaded : false,
    canPickFolder: hasLinkedCheckoutPicker(),
  };
}
