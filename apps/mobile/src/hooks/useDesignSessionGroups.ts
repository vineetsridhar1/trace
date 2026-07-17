import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useEntityStore, type SessionEntity, type SessionGroupEntity } from "@trace/client-core";
import type { Session, SessionGroup } from "@trace/gql";
import { handleUnauthorized, isUnauthorized } from "@/lib/auth";
import { buildDesignSessionGroupIds } from "@/lib/app-sessions";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";

const DESIGN_SESSION_GROUPS_QUERY = gql`
  query MobileDesignSessionGroups($organizationId: ID!) {
    designSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      archivedAt
      createdAt
      updatedAt
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
      sessions {
        id
        name
        sessionGroupId
        agentStatus
        sessionStatus
        hosting
        lastMessageAt
        lastUserMessageAt
        createdAt
        updatedAt
        createdBy {
          id
          name
          avatarUrl
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
      }
    }
  }
`;

interface RefreshResult {
  authorized: boolean;
}

interface DesignSessionGroupsData {
  designSessionGroups?: Array<
    SessionGroup & { id: string; sessions?: Array<Session & { id: string }> }
  >;
}

function areIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function useDesignSessionGroups(activeOrgId: string | null): {
  ids: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<RefreshResult>;
} {
  const [loading, setLoading] = useState(Boolean(activeOrgId));
  const [error, setError] = useState<string | null>(null);
  const ids = useStoreWithEqualityFn(useEntityStore, buildDesignSessionGroupIds, areIdsEqual);

  const refresh = useCallback(async (): Promise<RefreshResult> => {
    if (!activeOrgId) return { authorized: true };
    const result = await getClient()
      .query<DesignSessionGroupsData>(
        DESIGN_SESSION_GROUPS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    if (isUnauthorized(result.error)) return { authorized: false };
    if (result.error) {
      setError(userFacingError(result.error, "Couldn't load designs."));
      return { authorized: true };
    }

    const groups = result.data?.designSessionGroups ?? [];
    const store = useEntityStore.getState();
    if (groups.length > 0) {
      store.upsertMany("sessionGroups", groups as SessionGroupEntity[]);
      const sessions = groups.flatMap((group) => group.sessions ?? []);
      if (sessions.length > 0) store.upsertMany("sessions", sessions as SessionEntity[]);
    }
    setError(null);
    return { authorized: true };
  }, [activeOrgId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(Boolean(activeOrgId));
    void refresh()
      .then((result) => {
        if (!cancelled && !result.authorized) return handleUnauthorized();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, refresh]);

  return { ids, loading, error, refresh };
}
