import { router } from "expo-router";
import {
  generateUUID,
  START_SESSION_MUTATION,
  useEntityStore,
  type EntityState,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { getDefaultModel } from "@trace/shared";
import type { CodingTool, HostingMode } from "@trace/gql";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";

const DEFAULT_TOOL: CodingTool = "claude_code";
const DEFAULT_HOSTING: HostingMode = "cloud";

interface OptimisticEntities {
  tempSessionId: string;
  tempGroupId: string;
  tool: CodingTool;
  model: string | undefined;
  hosting: HostingMode;
  channelId: string;
  repoId: string | undefined;
}

/**
 * Mobile twin of web's `createQuickSession`: inserts optimistic session
 * entities, deep-links straight to the composer, and fires the real
 * mutation in the background. When the server responds, the temp entities
 * are swapped for the real ones and the URL is replaced in place — so
 * the user can start typing before the round-trip completes.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  const channel = useEntityStore.getState().channels[channelId];
  const channelRepoId = channel?.repo?.id;

  const tempSessionId = generateUUID();
  const tempGroupId = generateUUID();
  const tool = DEFAULT_TOOL;
  const model = getDefaultModel(tool);
  const hosting = DEFAULT_HOSTING;

  const optimistic: OptimisticEntities = {
    tempSessionId,
    tempGroupId,
    tool,
    model,
    hosting,
    channelId,
    repoId: channelRepoId,
  };

  insertOptimistic(optimistic);
  void haptic.light();
  router.push(`/sessions/${tempGroupId}/${tempSessionId}`);

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(
        START_SESSION_MUTATION,
        {
          input: {
            tool,
            model,
            hosting,
            channelId,
            repoId: channelRepoId,
          },
        },
      )
      .toPromise();
    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    reconcile(optimistic, {
      realSessionId: session.id,
      realGroupId: session.sessionGroupId,
    });
    router.replace(`/sessions/${session.sessionGroupId}/${session.id}`);
  } catch (err) {
    rollback(optimistic);
    router.back();
    console.error("[createQuickSession] failed", err);
  }
}

function insertOptimistic(o: OptimisticEntities): void {
  const now = new Date().toISOString();
  const store = useEntityStore.getState();
  const repo = o.repoId ? { id: o.repoId } : null;

  store.upsert(
    "sessionGroups",
    o.tempGroupId,
    {
      id: o.tempGroupId,
      name: "New session",
      status: "in_progress",
      channel: { id: o.channelId },
      repo,
      branch: null,
      worktreeDeleted: false,
      createdAt: now,
      updatedAt: now,
      _sortTimestamp: now,
      _optimistic: true,
    } as Partial<SessionGroupEntity> as SessionGroupEntity,
  );

  store.upsert(
    "sessions",
    o.tempSessionId,
    {
      id: o.tempSessionId,
      name: "New session",
      sessionGroupId: o.tempGroupId,
      agentStatus: "not_started",
      sessionStatus: "in_progress",
      tool: o.tool,
      model: o.model ?? null,
      hosting: o.hosting,
      channel: { id: o.channelId },
      repo,
      branch: null,
      createdAt: now,
      updatedAt: now,
      _optimistic: true,
    } as Partial<SessionEntity> as SessionEntity,
  );
}

function buildRealGroup(o: OptimisticEntities, realGroupId: string): SessionGroupEntity {
  const now = new Date().toISOString();
  const repo = o.repoId ? { id: o.repoId } : null;
  return {
    id: realGroupId,
    name: "New session",
    status: "in_progress",
    channel: { id: o.channelId },
    repo,
    branch: null,
    worktreeDeleted: false,
    createdAt: now,
    updatedAt: now,
    _sortTimestamp: now,
  } as Partial<SessionGroupEntity> as SessionGroupEntity;
}

function buildRealSession(
  o: OptimisticEntities,
  realSessionId: string,
  realGroupId: string,
): SessionEntity {
  const now = new Date().toISOString();
  const repo = o.repoId ? { id: o.repoId } : null;
  return {
    id: realSessionId,
    name: "New session",
    sessionGroupId: realGroupId,
    agentStatus: "not_started",
    sessionStatus: "in_progress",
    tool: o.tool,
    model: o.model ?? null,
    hosting: o.hosting,
    channel: { id: o.channelId },
    repo,
    branch: null,
    createdAt: now,
    updatedAt: now,
  } as Partial<SessionEntity> as SessionEntity;
}

function reconcile(
  o: OptimisticEntities,
  real: { realSessionId: string; realGroupId: string },
): void {
  useEntityStore.setState((state: EntityState) => {
    const sessions = { ...state.sessions };
    delete sessions[o.tempSessionId];
    sessions[real.realSessionId] = buildRealSession(o, real.realSessionId, real.realGroupId);

    const sessionGroups = { ...state.sessionGroups };
    delete sessionGroups[o.tempGroupId];
    sessionGroups[real.realGroupId] = buildRealGroup(o, real.realGroupId);

    const idx = { ...state._sessionIdsByGroup };
    if (idx[o.tempGroupId]) {
      idx[o.tempGroupId] = idx[o.tempGroupId].filter((id: string) => id !== o.tempSessionId);
      if (idx[o.tempGroupId].length === 0) delete idx[o.tempGroupId];
    }
    idx[real.realGroupId] = [
      ...(idx[real.realGroupId] ?? []).filter((id: string) => id !== real.realSessionId),
      real.realSessionId,
    ];

    return { sessions, sessionGroups, _sessionIdsByGroup: idx };
  });
}

function rollback(o: OptimisticEntities): void {
  useEntityStore.setState((state: EntityState) => {
    const sessions = { ...state.sessions };
    delete sessions[o.tempSessionId];

    const sessionGroups = { ...state.sessionGroups };
    delete sessionGroups[o.tempGroupId];

    const idx = { ...state._sessionIdsByGroup };
    if (idx[o.tempGroupId]) {
      idx[o.tempGroupId] = idx[o.tempGroupId].filter((id: string) => id !== o.tempSessionId);
      if (idx[o.tempGroupId].length === 0) delete idx[o.tempGroupId];
    }

    return { sessions, sessionGroups, _sessionIdsByGroup: idx };
  });
}
