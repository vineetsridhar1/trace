import { useEffect } from "react";
import { create } from "zustand";
import type { DocumentInput } from "@urql/core";
import { client } from "../lib/urql";
import { useUIStore, type UIState } from "./ui";
import {
  COMMIT_LINKED_CHECKOUT_CHANGES_MUTATION,
  LINKED_CHECKOUT_STATUS_QUERY,
  LINK_LINKED_CHECKOUT_REPO_MUTATION,
  RESTORE_LINKED_CHECKOUT_MUTATION,
  SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION,
  SYNC_LINKED_CHECKOUT_MUTATION,
} from "@trace/client-core";

export interface LinkedCheckoutSyncRequest extends DesktopLinkedCheckoutSyncInput {
  runtimeInstanceId: string;
}

type LinkedCheckoutQueryData = {
  linkedCheckoutStatus?: DesktopLinkedCheckoutStatus | null;
};

type LinkedCheckoutMutationField =
  | "linkLinkedCheckoutRepo"
  | "syncLinkedCheckout"
  | "commitLinkedCheckoutChanges"
  | "restoreLinkedCheckout"
  | "setLinkedCheckoutAutoSync";

type LinkedCheckoutMutationData = Partial<
  Record<LinkedCheckoutMutationField, DesktopLinkedCheckoutActionResult | null>
>;

interface LinkedCheckoutState {
  statusByKey: Record<string, DesktopLinkedCheckoutStatus | null | undefined>;
  pendingByKey: Record<string, boolean>;
  setStatus: (key: string, status: DesktopLinkedCheckoutStatus | null) => void;
  setPending: (key: string, pending: boolean) => void;
}

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
    hasUncommittedChanges: false,
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

export const useLinkedCheckoutStore = create<LinkedCheckoutState>((set) => ({
  statusByKey: {},
  pendingByKey: {},

  setStatus: (key, status) =>
    set((state) => ({
      statusByKey: {
        ...state.statusByKey,
        [key]: status,
      },
    })),

  setPending: (key, pending) =>
    set((state) => ({
      pendingByKey: {
        ...state.pendingByKey,
        [key]: pending,
      },
    })),
}));

function isLinkedCheckoutPending(
  repoId: string | null | undefined,
  runtimeInstanceId: string | null | undefined,
): boolean {
  const key = getStoreKey(repoId, runtimeInstanceId);
  if (!key) return false;
  return useLinkedCheckoutStore.getState().pendingByKey[key] ?? false;
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

export async function syncLinkedCheckout(
  request: LinkedCheckoutSyncRequest,
): Promise<DesktopLinkedCheckoutActionResult> {
  const key = getStoreKey(request.repoId, request.runtimeInstanceId);
  if (!key) {
    throw new Error("Missing linked checkout session group, repo, or runtime.");
  }

  useLinkedCheckoutStore.getState().setPending(key, true);
  try {
    const result = await runLinkedCheckoutMutation(
      SYNC_LINKED_CHECKOUT_MUTATION,
      "syncLinkedCheckout",
      {
        sessionGroupId: request.sessionGroupId,
        repoId: request.repoId,
        branch: request.branch,
        commitSha: request.commitSha,
        autoSyncEnabled: request.autoSyncEnabled,
      },
    );
    useLinkedCheckoutStore.getState().setStatus(key, result.status);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      (await refreshLinkedCheckoutStatus(
        request.repoId,
        request.sessionGroupId,
        request.runtimeInstanceId,
      ).catch(() => null)) ?? emptyStatus(request.repoId);
    useLinkedCheckoutStore.getState().setStatus(key, status);
    return { ok: false, error: message, status };
  } finally {
    useLinkedCheckoutStore.getState().setPending(key, false);
  }
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

export async function commitLinkedCheckoutChanges(
  repoId: string,
  sessionGroupId: string,
  runtimeInstanceId: string,
  message?: string | null,
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
      COMMIT_LINKED_CHECKOUT_CHANGES_MUTATION,
      "commitLinkedCheckoutChanges",
      {
        sessionGroupId,
        repoId,
        message,
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
  const refreshTick = useUIStore((s: UIState) => s.refreshTick);

  useEffect(() => {
    if (!enabled || !repoId || !sessionGroupId || !runtimeInstanceId) return;
    void refreshLinkedCheckoutStatus(repoId, sessionGroupId, runtimeInstanceId).catch(() => {});
  }, [enabled, repoId, runtimeInstanceId, sessionGroupId, refreshTick]);

  return {
    status: enabled ? (status ?? null) : null,
    pending: enabled ? pending : false,
    loaded: enabled ? loaded : false,
    canPickFolder: hasLinkedCheckoutPicker(),
  };
}
