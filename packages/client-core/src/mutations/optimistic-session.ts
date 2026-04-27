import {
  useEntityStore,
  type EntityState,
  type SessionEntity,
  type SessionGroupEntity,
} from "../stores/entity.js";

export interface OptimisticSessionShape {
  tool: string;
  model?: string | null;
  hosting: string;
  channelId: string;
  repoId?: string | null;
}

export interface InsertOptimisticSessionPairParams extends OptimisticSessionShape {
  tempSessionId: string;
  tempGroupId: string;
  name?: string;
}

export interface ReconcileOptimisticSessionPairParams extends OptimisticSessionShape {
  tempSessionId: string;
  tempGroupId: string;
  realSessionId: string;
  realGroupId: string;
  name?: string;
}

export interface RollbackOptimisticSessionPairParams {
  tempSessionId: string;
  tempGroupId: string;
}

function buildSessionGroupEntity(params: {
  id: string;
  name: string;
  channelId: string;
  repoId: string | null;
  optimistic: boolean;
}): SessionGroupEntity {
  const now = new Date().toISOString();
  return {
    id: params.id,
    name: params.name,
    status: "in_progress",
    channel: { id: params.channelId },
    repo: params.repoId ? { id: params.repoId } : null,
    branch: null,
    worktreeDeleted: false,
    createdAt: now,
    updatedAt: now,
    _sortTimestamp: now,
    ...(params.optimistic ? { _optimistic: true } : {}),
  } as Partial<SessionGroupEntity> as SessionGroupEntity;
}

function buildSessionEntity(params: {
  id: string;
  name: string;
  sessionGroupId: string;
  tool: string;
  model: string | null;
  hosting: string;
  channelId: string;
  repoId: string | null;
  optimistic: boolean;
}): SessionEntity {
  const now = new Date().toISOString();
  return {
    id: params.id,
    name: params.name,
    sessionGroupId: params.sessionGroupId,
    agentStatus: "not_started",
    sessionStatus: "in_progress",
    tool: params.tool,
    model: params.model,
    hosting: params.hosting,
    channel: { id: params.channelId },
    repo: params.repoId ? { id: params.repoId } : null,
    branch: null,
    createdAt: now,
    updatedAt: now,
    ...(params.optimistic ? { _optimistic: true } : {}),
  } as Partial<SessionEntity> as SessionEntity;
}

/**
 * Insert a temporary session + its parent group into the entity store so the
 * UI can render the new session before the create mutation resolves.
 * Platform-specific navigation/overlay logic lives outside this module.
 */
export function insertOptimisticSessionPair(params: InsertOptimisticSessionPairParams): void {
  const name = params.name ?? "New session";
  const repoId = params.repoId ?? null;
  const store = useEntityStore.getState();

  store.upsert(
    "sessionGroups",
    params.tempGroupId,
    buildSessionGroupEntity({
      id: params.tempGroupId,
      name,
      channelId: params.channelId,
      repoId,
      optimistic: true,
    }),
  );

  store.upsert(
    "sessions",
    params.tempSessionId,
    buildSessionEntity({
      id: params.tempSessionId,
      name,
      sessionGroupId: params.tempGroupId,
      tool: params.tool,
      model: params.model ?? null,
      hosting: params.hosting,
      channelId: params.channelId,
      repoId,
      optimistic: true,
    }),
  );
}

/**
 * Atomically swap temp session + group entities for real server-issued ones.
 * Runs in a single setState so consumers never see an intermediate state where
 * neither entity exists. Platform-specific callers must separately retarget
 * any navigation state (router URL, Player overlay id, active tab) that still
 * points at the temp ids.
 */
export function reconcileOptimisticSessionPair(params: ReconcileOptimisticSessionPairParams): void {
  const name = params.name ?? "New session";
  const repoId = params.repoId ?? null;
  const realGroup = buildSessionGroupEntity({
    id: params.realGroupId,
    name,
    channelId: params.channelId,
    repoId,
    optimistic: false,
  });
  const realSession = buildSessionEntity({
    id: params.realSessionId,
    name,
    sessionGroupId: params.realGroupId,
    tool: params.tool,
    model: params.model ?? null,
    hosting: params.hosting,
    channelId: params.channelId,
    repoId,
    optimistic: false,
  });

  useEntityStore.setState((state: EntityState) => {
    const sessions = { ...state.sessions };
    delete sessions[params.tempSessionId];
    sessions[params.realSessionId] = realSession;

    const sessionGroups = { ...state.sessionGroups };
    delete sessionGroups[params.tempGroupId];
    sessionGroups[params.realGroupId] = realGroup;

    const idx = { ...state._sessionIdsByGroup };
    if (idx[params.tempGroupId]) {
      idx[params.tempGroupId] = idx[params.tempGroupId].filter(
        (id: string) => id !== params.tempSessionId,
      );
      if (idx[params.tempGroupId].length === 0) delete idx[params.tempGroupId];
    }
    idx[params.realGroupId] = [
      ...(idx[params.realGroupId] ?? []).filter((id: string) => id !== params.realSessionId),
      params.realSessionId,
    ];

    return { sessions, sessionGroups, _sessionIdsByGroup: idx };
  });
}

/**
 * Remove temp session + group entities after a failed create mutation.
 * Platform-specific callers must separately roll back any navigation state
 * that was seeded alongside the insert.
 */
export function rollbackOptimisticSessionPair(params: RollbackOptimisticSessionPairParams): void {
  useEntityStore.setState((state: EntityState) => {
    const sessions = { ...state.sessions };
    delete sessions[params.tempSessionId];

    const sessionGroups = { ...state.sessionGroups };
    delete sessionGroups[params.tempGroupId];

    const idx = { ...state._sessionIdsByGroup };
    if (idx[params.tempGroupId]) {
      idx[params.tempGroupId] = idx[params.tempGroupId].filter(
        (id: string) => id !== params.tempSessionId,
      );
      if (idx[params.tempGroupId].length === 0) delete idx[params.tempGroupId];
    }

    return { sessions, sessionGroups, _sessionIdsByGroup: idx };
  });
}
