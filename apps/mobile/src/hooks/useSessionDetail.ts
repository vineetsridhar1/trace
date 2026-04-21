import { useEffect } from "react";
import { gql } from "@urql/core";
import {
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import type { QueuedMessage, Session } from "@trace/gql";
import { getClient } from "@/lib/urql";
import { fetchSessionGroupDetail } from "@/hooks/useSessionGroupDetail";

/**
 * Loads per-session hydration that the list-level queries don't provide:
 * `queuedMessages` and per-session `gitCheckpoints`. Mirrors web's
 * SESSION_DETAIL_QUERY. Resolves the ticket-20 follow-up about per-session
 * hydration — `CheckpointMarker` reads `sessions[sessionId].gitCheckpoints`
 * and ticket 23 will read `queuedMessages` for the queued-messages strip.
 *
 * The query intentionally stays in the mobile hook for now. Extracting it
 * into `@trace/client-core` (so web's `SessionDetailView` also consumes it)
 * is listed as a nice-to-have in ticket 21 and is left as a follow-up.
 */
const SESSION_DETAIL_QUERY = gql`
  query MobileSessionDetail($id: ID!) {
    session(id: $id) {
      id
      name
      agentStatus
      sessionStatus
      tool
      model
      hosting
      branch
      workdir
      prUrl
      worktreeDeleted
      lastUserMessageAt
      lastMessageAt
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
        autoRetryable
      }
      gitCheckpoints {
        id
        sessionId
        promptEventId
        commitSha
        subject
        author
        committedAt
        filesChanged
        createdAt
      }
      queuedMessages {
        id
        sessionId
        text
        interactionMode
        position
        createdAt
      }
      sessionGroupId
      sessionGroup {
        id
        gitCheckpoints {
          id
          sessionId
          promptEventId
          commitSha
          subject
          author
          committedAt
          filesChanged
          createdAt
        }
      }
      channel {
        id
      }
      createdAt
      updatedAt
    }
  }
`;

type FetchedSession = Session & {
  id: string;
  queuedMessages?: QueuedMessage[];
  sessionGroup?: SessionGroupEntity;
};

async function doFetchSessionDetail(sessionId: string): Promise<void> {
  const result = await getClient()
    .query(SESSION_DETAIL_QUERY, { id: sessionId })
    .toPromise();
  const fetched = result.data?.session as FetchedSession | null | undefined;
  if (result.error || !fetched) return;

  const state = useEntityStore.getState();
  const existing = state.sessions[sessionId];

  state.upsert("sessions", sessionId, {
    ...(existing ?? {}),
    ...fetched,
  } as SessionEntity);

  const sessionGroup = fetched.sessionGroup;
  if (sessionGroup?.id) {
    const existingGroup = state.sessionGroups[sessionGroup.id];
    state.upsert("sessionGroups", sessionGroup.id, {
      ...(existingGroup ?? {}),
      ...sessionGroup,
    } as SessionGroupEntity);
  }

  const queued = fetched.queuedMessages ?? [];
  // Refresh the authoritative queue index even when the server returns an empty
  // queue, so backgrounded clients don't keep stale queued-message chips.
  useEntityStore.setState((current) => {
    const qmTable = { ...current.queuedMessages };
    const previousIds = current._queuedMessageIdsBySession[sessionId] ?? [];
    const ids: string[] = [];
    const nextIds = new Set<string>();
    for (const qm of queued) {
      qmTable[qm.id] = qm;
      ids.push(qm.id);
      nextIds.add(qm.id);
    }
    for (const id of previousIds) {
      if (!nextIds.has(id)) delete qmTable[id];
    }
    return {
      queuedMessages: qmTable,
      _queuedMessageIdsBySession: {
        ...current._queuedMessageIdsBySession,
        [sessionId]: ids,
      },
    };
  });

  // Entry points like deep links and push-notification taps hit this fetcher
  // before the session's parent group is in the store. Chain the group
  // detail fetch so the Session Player has its header data without waiting
  // for overlay mount. `fetchSessionGroupDetail` is itself deduped, so this
  // is a no-op if the group has already been fetched.
  const groupIdAfterUpsert =
    fetched.sessionGroupId ?? fetched.sessionGroup?.id ?? null;
  if (groupIdAfterUpsert) {
    void fetchSessionGroupDetail(groupIdAfterUpsert);
  }
}

/**
 * See fetchSessionGroupDetail for the rationale. The entity store is kept
 * fresh by the org-wide event subscription, so a repeat fetch within the
 * TTL window is redundant and protects against the `onPressIn`-on-scroll
 * pattern where a browsing finger lightly touches many rows.
 */
const inflightSessionFetches = new Map<string, Promise<void>>();
const lastSessionFetchAt = new Map<string, number>();
const FETCH_TTL_MS = 30_000;

export function fetchSessionDetail(sessionId: string): Promise<void> {
  const existing = inflightSessionFetches.get(sessionId);
  if (existing) return existing;
  const lastAt = lastSessionFetchAt.get(sessionId);
  if (lastAt && Date.now() - lastAt < FETCH_TTL_MS) return Promise.resolve();
  const promise = doFetchSessionDetail(sessionId).finally(() => {
    inflightSessionFetches.delete(sessionId);
    lastSessionFetchAt.set(sessionId, Date.now());
  });
  inflightSessionFetches.set(sessionId, promise);
  return promise;
}

export function useSessionDetail(sessionId: string): void {
  useEffect(() => {
    void fetchSessionDetail(sessionId);
  }, [sessionId]);
}
