import { useEntityStore } from "../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../stores/entity";

/**
 * Optimistically insert a new session into the entity store so that
 * tab navigation works immediately — before the `session_started`
 * event arrives via the org-wide subscription.
 *
 * The event stream will reconcile the entity with full server data
 * when it arrives.
 */
export function optimisticallyInsertSession(params: {
  id: string;
  name?: string | null;
  sessionGroupId: string;
  tool: string;
  model?: string | null;
  hosting: string;
  channel?: { id: string } | null;
  repo?: { id: string } | null;
  branch?: string | null;
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
    hosting: params.hosting,
    channel: params.channel ?? null,
    repo: params.repo ?? null,
    branch: params.branch ?? null,
    createdAt: now,
    updatedAt: now,
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
}): void {
  const now = new Date().toISOString();
  useEntityStore.getState().upsert("sessionGroups", params.id, {
    id: params.id,
    name: params.name ?? "New session",
    status: "not_started",
    channel: params.channel ?? null,
    repo: params.repo ?? null,
    branch: null,
    worktreeDeleted: false,
    createdAt: now,
    updatedAt: now,
    _sortTimestamp: now,
  } as Partial<SessionGroupEntity> as SessionGroupEntity);
}

/**
 * Reconcile optimistic session entities with server-returned IDs.
 * Removes temp entities and inserts real ones, updating UI store references.
 */
export function reconcileOptimisticSession(params: {
  tempSessionId: string;
  tempGroupId: string;
  realSessionId: string;
  realGroupId: string;
  tool: string;
  model?: string | null;
  hosting: string;
  channelId: string;
  repoId?: string | null;
}): void {
  const store = useEntityStore.getState();
  const now = new Date().toISOString();

  // Remove temp entities
  store.remove("sessions", params.tempSessionId);
  store.remove("sessionGroups", params.tempGroupId);

  // Insert real session group (will be reconciled again when server event arrives)
  optimisticallyInsertSessionGroup({
    id: params.realGroupId,
    channel: { id: params.channelId },
    repo: params.repoId ? { id: params.repoId } : null,
  });

  // Insert real session
  optimisticallyInsertSession({
    id: params.realSessionId,
    sessionGroupId: params.realGroupId,
    tool: params.tool,
    model: params.model,
    hosting: params.hosting,
    channel: { id: params.channelId },
    repo: params.repoId ? { id: params.repoId } : null,
  });
}

/**
 * Remove optimistic temp entities on mutation failure.
 */
export function rollbackOptimisticSession(tempSessionId: string, tempGroupId: string): void {
  const store = useEntityStore.getState();
  store.remove("sessions", tempSessionId);
  store.remove("sessionGroups", tempGroupId);
}
