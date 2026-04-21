import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  type EntityState,
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import type { Session, SessionGroup } from "@trace/gql";
import { getClient } from "@/lib/urql";

const SESSION_GROUP_DETAIL_QUERY = gql`
  query MobileSessionGroupDetail($id: ID!) {
    sessionGroup(id: $id) {
      id
      name
      slug
      status
      archivedAt
      branch
      prUrl
      workdir
      worktreeDeleted
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
      repo {
        id
        name
        defaultBranch
      }
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
      channel {
        id
      }
      setupStatus
      setupError
      createdAt
      updatedAt
      sessions {
        id
        name
        agentStatus
        sessionStatus
        tool
        model
        hosting
        branch
        prUrl
        worktreeDeleted
        sessionGroupId
        lastMessageAt
        lastUserMessageAt
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
        createdBy {
          id
          name
          avatarUrl
        }
        repo {
          id
          name
        }
        channel {
          id
        }
        createdAt
        updatedAt
      }
    }
  }
`;

function sessionTime(session: SessionEntity | undefined): number {
  const raw =
    session?._sortTimestamp
    ?? session?.lastMessageAt
    ?? session?.updatedAt
    ?? session?.createdAt;
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

const EMPTY_IDS: string[] = [];

function areIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function doFetchSessionGroupDetail(groupId: string): Promise<void> {
  const result = await getClient()
    .query(SESSION_GROUP_DETAIL_QUERY, { id: groupId })
    .toPromise();
  const group = result.data?.sessionGroup as (SessionGroup & { id: string }) | null | undefined;
  if (result.error || !group) return;

  const existing = useEntityStore.getState();
  const sessions = (group.sessions ?? []) as Array<Session & { id: string }>;
  const mergedSessions = sessions.map((session) => ({
    ...(existing.sessions[session.id] ?? {}),
    ...session,
  })) as Array<SessionEntity & { id: string }>;
  const sortedSessions = mergedSessions
    .slice()
    .sort((a, b) => sessionTime(b) - sessionTime(a) || a.id.localeCompare(b.id));

  existing.upsert(
    "sessionGroups",
    group.id,
    {
      ...(existing.sessionGroups[group.id] ?? {}),
      ...group,
      _sortTimestamp:
        sortedSessions[0]?.lastMessageAt
        ?? sortedSessions[0]?.updatedAt
        ?? group.updatedAt,
    } as SessionGroupEntity,
  );
  if (mergedSessions.length > 0) {
    existing.upsertMany("sessions", mergedSessions);
  }
}

/**
 * In-flight requests keyed by groupId. Callers that fire while a fetch is
 * already pending receive the same promise, so prefetch-on-press and
 * overlay-mount hooks coalesce into a single network round-trip regardless
 * of timing.
 */
const inflightGroupFetches = new Map<string, Promise<void>>();

export function fetchSessionGroupDetail(groupId: string): Promise<void> {
  const existing = inflightGroupFetches.get(groupId);
  if (existing) return existing;
  const promise = doFetchSessionGroupDetail(groupId).finally(() => {
    inflightGroupFetches.delete(groupId);
  });
  inflightGroupFetches.set(groupId, promise);
  return promise;
}

export function useEnsureSessionGroupDetail(groupId: string | undefined): boolean {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    // Skip the spinner when the group is already hydrated (e.g. a prefetch on
    // row touch-down landed before the overlay mounted, or the user is
    // reopening the same group). Without this, `SessionSurface`'s spinner
    // branch fires for one frame and remounts the whole tree mid-animation.
    const alreadyHydrated = Boolean(
      useEntityStore.getState().sessionGroups[groupId],
    );
    let cancelled = false;
    if (!alreadyHydrated) setLoading(true);
    fetchSessionGroupDetail(groupId).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return loading;
}

export function useSessionGroupSessionIds(groupId: string): string[] {
  return useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): string[] => {
      const ids = state._sessionIdsByGroup[groupId];
      if (!ids || ids.length === 0) return EMPTY_IDS;
      return ids
        .slice()
        .sort((a, b) => {
          const diff = sessionTime(state.sessions[b]) - sessionTime(state.sessions[a]);
          return diff !== 0 ? diff : a.localeCompare(b);
        });
    },
    areIdsEqual,
  );
}
