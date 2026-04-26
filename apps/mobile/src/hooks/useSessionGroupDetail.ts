import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  type EntityState,
  useEntityStore,
  type SessionEntity,
} from "@trace/client-core";
import type { Session, SessionGroup } from "@trace/gql";
import { userFacingError } from "@/lib/requestError";
import { mergeSessionGroupEntity } from "@/lib/session-group";
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
        remoteUrl
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
    session?._sortTimestamp ?? session?.lastMessageAt ?? session?.updatedAt ?? session?.createdAt;
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

interface SessionGroupDetailResult {
  ok: boolean;
  error: string | null;
}

async function doFetchSessionGroupDetail(groupId: string): Promise<SessionGroupDetailResult> {
  const result = await getClient().query(SESSION_GROUP_DETAIL_QUERY, { id: groupId }).toPromise();
  const group = result.data?.sessionGroup as (SessionGroup & { id: string }) | null | undefined;
  if (result.error) {
    return { ok: false, error: userFacingError(result.error, "Couldn't load this workspace.") };
  }
  if (!group) {
    return { ok: false, error: "Couldn't load this workspace." };
  }

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
    mergeSessionGroupEntity(
      existing.sessionGroups[group.id],
      group,
      sortedSessions[0]?.lastMessageAt ?? sortedSessions[0]?.updatedAt ?? group.updatedAt,
    ),
  );
  if (mergedSessions.length > 0) {
    existing.upsertMany("sessions", mergedSessions);
  }
  return { ok: true, error: null };
}

/**
 * In-flight requests keyed by groupId, plus completion timestamps for
 * throttling. Callers that fire while a fetch is already pending receive
 * the same promise (coalescing prefetch-on-press and overlay-mount into
 * one round-trip). Callers that fire within `FETCH_TTL_MS` of a prior
 * successful fetch get a resolved promise — the entity store is already
 * kept fresh by the org-wide event subscription, so repeat fetches during
 * a single browsing session are redundant.
 *
 * This guards against repeated open attempts and overlapping overlay-mount
 * fetches without requiring callers to reason about request coalescing.
 */
const inflightGroupFetches = new Map<string, Promise<SessionGroupDetailResult>>();
const lastGroupFetchAt = new Map<string, number>();
const FETCH_TTL_MS = 30_000;

export function fetchSessionGroupDetail(groupId: string): Promise<SessionGroupDetailResult> {
  const existing = inflightGroupFetches.get(groupId);
  if (existing) return existing;
  const lastAt = lastGroupFetchAt.get(groupId) ?? 0;
  if (lastAt && Date.now() - lastAt < FETCH_TTL_MS) {
    return Promise.resolve({ ok: true, error: null });
  }
  const promise = doFetchSessionGroupDetail(groupId).then((result) => {
    if (result.ok) lastGroupFetchAt.set(groupId, Date.now());
    return result;
  }).finally(() => {
    inflightGroupFetches.delete(groupId);
  });
  inflightGroupFetches.set(groupId, promise);
  return promise;
}

export function useEnsureSessionGroupDetail(
  groupId: string | undefined,
): { loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    // Skip the spinner when the detail query has already populated this
    // group (e.g. a confirmed open already prefetched the row, or the user
    // is reopening the same group). Without this,
    // `SessionSurface`'s spinner branch fires for one frame and remounts
    // the whole tree mid-animation.
    //
    // Checking `gitCheckpoints !== undefined` is the precise signal —
    // list-level queries populate `sessionGroups[id]` with `name`, `status`,
    // etc. but don't select `gitCheckpoints`. Only the detail query sets
    // that field (as at minimum an empty array). A truthy store entry
    // alone isn't enough — a partial list-level record would pass and
    // leave downstream reads (tab strip, checkpoint markers) empty.
    const group = useEntityStore.getState().sessionGroups[groupId];
    const alreadyHydrated = group?._optimistic === true || group?.gitCheckpoints !== undefined;
    let cancelled = false;
    if (group?._optimistic === true) {
      setLoading(false);
      return;
    }
    if (!alreadyHydrated) setLoading(true);
    void fetchSessionGroupDetail(groupId).then((result) => {
      if (cancelled) return;
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return { loading, error };
}

export function useSessionGroupSessionIds(groupId: string): string[] {
  return useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): string[] => {
      const ids = state._sessionIdsByGroup[groupId];
      if (!ids || ids.length === 0) return EMPTY_IDS;
      return ids.slice().sort((a, b) => {
        const diff = sessionTime(state.sessions[b]) - sessionTime(state.sessions[a]);
        return diff !== 0 ? diff : a.localeCompare(b);
      });
    },
    areIdsEqual,
  );
}
