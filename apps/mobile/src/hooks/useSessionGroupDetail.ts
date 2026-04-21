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

export async function fetchSessionGroupDetail(groupId: string): Promise<void> {
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

export function useEnsureSessionGroupDetail(groupId: string | undefined): boolean {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setLoading(true);
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
