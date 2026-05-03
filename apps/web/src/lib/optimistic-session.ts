import {
  reconcileOptimisticSessionPair,
  rollbackOptimisticSessionPair,
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { useUIStore } from "../stores/ui";

type UIStoreState = {
  openSessionTabsByGroup: Record<string, string[]>;
  lastSelectedSessionIdsByGroup: Record<string, string>;
};

/**
 * Web wrappers around client-core's optimistic-session helpers. The pure
 * entity-store writes live in client-core so mobile can reuse them; web adds
 * the UI-store tab-cleanup that the web surface needs when a temp session is
 * reconciled or rolled back.
 */

/**
 * Optimistically insert a new session into the entity store so that
 * tab navigation works immediately — before the `session_started`
 * event arrives via the org-wide subscription.
 */
export function optimisticallyInsertSession(params: {
  id: string;
  name?: string | null;
  sessionGroupId: string;
  tool: string;
  model?: string | null;
  reasoningEffort?: string | null;
  hosting: string;
  channel?: { id: string } | null;
  repo?: { id: string } | null;
  branch?: string | null;
  optimistic?: boolean;
}): void {
  const now = new Date().toISOString();
  useEntityStore.getState().upsert("sessions", params.id, {
    id: params.id,
    name: params.name ?? "New session",
    sessionGroupId: params.sessionGroupId,
    agentStatus: "not_started",
    sessionStatus: "in_progress",
    tool: params.tool,
    model: params.model ?? null,
    reasoningEffort: params.reasoningEffort ?? null,
    hosting: params.hosting,
    channel: params.channel ?? null,
    repo: params.repo ?? null,
    branch: params.branch ?? null,
    createdAt: now,
    updatedAt: now,
    _optimistic: params.optimistic ? true : undefined,
  } as Partial<SessionEntity> as SessionEntity);
}

/**
 * Optimistically insert a session group so the UI can navigate to it
 * before the server responds.
 */
export function optimisticallyInsertSessionGroup(params: {
  id: string;
  name?: string;
  channel?: { id: string } | null;
  repo?: { id: string } | null;
  optimistic?: boolean;
}): void {
  const now = new Date().toISOString();
  useEntityStore.getState().upsert("sessionGroups", params.id, {
    id: params.id,
    name: params.name ?? "New session",
    status: "in_progress",
    channel: params.channel ?? null,
    repo: params.repo ?? null,
    branch: null,
    worktreeDeleted: false,
    createdAt: now,
    updatedAt: now,
    _sortTimestamp: now,
    _optimistic: params.optimistic ? true : undefined,
  } as Partial<SessionGroupEntity> as SessionGroupEntity);
}

/**
 * Reconcile optimistic session entities with server-returned IDs.
 * Delegates the entity-store swap to client-core, then cleans up the
 * web-only tab state that pointed at the temp group id.
 */
export function reconcileOptimisticSession(params: {
  tempSessionId: string;
  tempGroupId: string;
  realSessionId: string;
  realGroupId: string;
  tool: string;
  model?: string | null;
  reasoningEffort?: string | null;
  hosting: string;
  channelId: string;
  repoId?: string | null;
}): void {
  reconcileOptimisticSessionPair(params);

  // Clean up temp group's tab entry from UI store (closeSessionTab is a no-op
  // for single-tab groups, so we remove it directly)
  useUIStore.setState((s: UIStoreState) => {
    const { [params.tempGroupId]: _, ...rest } = s.openSessionTabsByGroup;
    const { [params.tempGroupId]: __, ...lastSelected } = s.lastSelectedSessionIdsByGroup;
    return {
      openSessionTabsByGroup: rest,
      lastSelectedSessionIdsByGroup: lastSelected,
    };
  });
}

/**
 * Remove optimistic temp entities on mutation failure, plus the web-only
 * tab state that was seeded alongside them.
 */
export function rollbackOptimisticSession(tempSessionId: string, tempGroupId: string): void {
  rollbackOptimisticSessionPair({ tempSessionId, tempGroupId });

  useUIStore.setState((s: UIStoreState) => {
    const { [tempGroupId]: _, ...rest } = s.openSessionTabsByGroup;
    const { [tempGroupId]: __, ...lastSelected } = s.lastSelectedSessionIdsByGroup;
    return {
      openSessionTabsByGroup: rest,
      lastSelectedSessionIdsByGroup: lastSelected,
    };
  });
}
