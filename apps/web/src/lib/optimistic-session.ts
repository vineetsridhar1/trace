import { useEntityStore } from "../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../stores/entity";
import { useUIStore } from "../stores/ui";

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

function buildSessionEntity(params: {
  id: string;
  sessionGroupId: string;
  tool: string;
  model?: string | null;
  hosting: string;
  channel?: { id: string } | null;
  repo?: { id: string } | null;
}): SessionEntity {
  const now = new Date().toISOString();
  return {
    id: params.id,
    name: "New session",
    sessionGroupId: params.sessionGroupId,
    agentStatus: "not_started",
    sessionStatus: "in_progress",
    tool: params.tool,
    model: params.model ?? null,
    hosting: params.hosting,
    channel: params.channel ?? null,
    repo: params.repo ?? null,
    branch: null,
    createdAt: now,
    updatedAt: now,
  } as Partial<SessionEntity> as SessionEntity;
}

function buildSessionGroupEntity(params: {
  id: string;
  channel?: { id: string } | null;
  repo?: { id: string } | null;
}): SessionGroupEntity {
  const now = new Date().toISOString();
  return {
    id: params.id,
    name: "New session",
    status: "in_progress",
    channel: params.channel ?? null,
    repo: params.repo ?? null,
    branch: null,
    worktreeDeleted: false,
    createdAt: now,
    updatedAt: now,
    _sortTimestamp: now,
  } as Partial<SessionGroupEntity> as SessionGroupEntity;
}

/**
 * Reconcile optimistic session entities with server-returned IDs.
 * Removes temp entities and inserts real ones in a single atomic setState
 * to avoid intermediate states where neither entity exists.
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
  const realGroup = buildSessionGroupEntity({
    id: params.realGroupId,
    channel: { id: params.channelId },
    repo: params.repoId ? { id: params.repoId } : null,
  });

  const realSession = buildSessionEntity({
    id: params.realSessionId,
    sessionGroupId: params.realGroupId,
    tool: params.tool,
    model: params.model,
    hosting: params.hosting,
    channel: { id: params.channelId },
    repo: params.repoId ? { id: params.repoId } : null,
  });

  // Atomic: remove temp + insert real in one setState to prevent flicker
  useEntityStore.setState((state) => {
    // Remove temp session
    const sessions = { ...state.sessions };
    delete sessions[params.tempSessionId];
    sessions[params.realSessionId] = realSession;

    // Remove temp session group
    const sessionGroups = { ...state.sessionGroups };
    delete sessionGroups[params.tempGroupId];
    sessionGroups[params.realGroupId] = realGroup;

    // Rebuild session-by-group index
    const idx = { ...state._sessionIdsByGroup };
    // Remove temp session from its group bucket
    if (idx[params.tempGroupId]) {
      idx[params.tempGroupId] = idx[params.tempGroupId].filter((id) => id !== params.tempSessionId);
      if (idx[params.tempGroupId].length === 0) delete idx[params.tempGroupId];
    }
    // Add real session to real group bucket
    idx[params.realGroupId] = [
      ...(idx[params.realGroupId] ?? []).filter((id) => id !== params.realSessionId),
      params.realSessionId,
    ];

    return { sessions, sessionGroups, _sessionIdsByGroup: idx };
  });

  // Clean up temp group's tab entry from UI store (closeSessionTab is a no-op
  // for single-tab groups, so we remove it directly)
  useUIStore.setState((s) => {
    const { [params.tempGroupId]: _, ...rest } = s.openSessionTabsByGroup;
    const { [params.tempGroupId]: __, ...lastSelected } = s.lastSelectedSessionIdsByGroup;
    return {
      openSessionTabsByGroup: rest,
      lastSelectedSessionIdsByGroup: lastSelected,
    };
  });
}

/**
 * Remove optimistic temp entities on mutation failure.
 */
export function rollbackOptimisticSession(tempSessionId: string, tempGroupId: string): void {
  useEntityStore.setState((state) => {
    const sessions = { ...state.sessions };
    delete sessions[tempSessionId];

    const sessionGroups = { ...state.sessionGroups };
    delete sessionGroups[tempGroupId];

    const idx = { ...state._sessionIdsByGroup };
    if (idx[tempGroupId]) {
      idx[tempGroupId] = idx[tempGroupId].filter((id) => id !== tempSessionId);
      if (idx[tempGroupId].length === 0) delete idx[tempGroupId];
    }

    return { sessions, sessionGroups, _sessionIdsByGroup: idx };
  });

  // Clean up temp group's tab entry
  useUIStore.setState((s) => {
    const { [tempGroupId]: _, ...rest } = s.openSessionTabsByGroup;
    const { [tempGroupId]: __, ...lastSelected } = s.lastSelectedSessionIdsByGroup;
    return {
      openSessionTabsByGroup: rest,
      lastSelectedSessionIdsByGroup: lastSelected,
    };
  });
}
