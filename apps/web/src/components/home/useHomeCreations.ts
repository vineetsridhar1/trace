import { useEffect } from "react";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import {
  mergeSessionGroupEntity,
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { useHomeDataStore } from "../../stores/home-data";

const HOME_CREATIONS_QUERY = gql`
  query HomeCreations($organizationId: ID!) {
    appSessionGroups(organizationId: $organizationId, includeArchived: true) {
      ...BaseCreationGroup
    }
  }

  fragment BaseCreationGroup on SessionGroup {
    id
    name
    slug
    kind
    status
    visibility
    archivedAt
    createdAt
    updatedAt
    owner {
      id
      name
      avatarUrl
    }
    connection {
      state
    }
    sessions {
      id
      sessionGroupId
      createdById
      agentStatus
      sessionStatus
      prUrl
      worktreeDeleted
      lastMessageAt
      lastUserMessageAt
      updatedAt
      createdAt
    }
  }
`;

const HOME_DESIGNS_QUERY = gql`
  query HomeDesigns($organizationId: ID!) {
    designSessionGroups(organizationId: $organizationId, includeArchived: true) {
      ...DesignCreationGroup
    }
  }

  fragment DesignCreationGroup on SessionGroup {
    id
    name
    slug
    kind
    status
    visibility
    archivedAt
    designPreviewUrl
    createdAt
    updatedAt
    owner {
      id
      name
      avatarUrl
    }
    connection {
      state
    }
    sessions {
      id
      sessionGroupId
      createdById
      agentStatus
      sessionStatus
      prUrl
      worktreeDeleted
      lastMessageAt
      lastUserMessageAt
      updatedAt
      createdAt
    }
  }
`;

type CreationGroup = SessionGroup & { id: string; sessions?: Array<Session & { id: string }> };

export function useHomeCreations(organizationId: string | null, loadDesigns = false) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const retryRequest = useHomeDataStore((state) => state.retryRequest);

  useEffect(() => {
    if (!organizationId) return;
    useHomeDataStore.getState().ensureOrganization(organizationId);
    useHomeDataStore.getState().markGeneratedStatus(organizationId, "loading");
    let active = true;

    void (async () => {
      try {
        const baseResult = await client
          .query(HOME_CREATIONS_QUERY, { organizationId }, { requestPolicy: "cache-and-network" })
          .toPromise();
        const designResult = loadDesigns
          ? await client
              .query(HOME_DESIGNS_QUERY, { organizationId }, { requestPolicy: "cache-and-network" })
              .toPromise()
          : null;
        if (!active) return;
        const groups = [
          ...(baseResult.data?.appSessionGroups ?? []),
          ...(designResult?.data?.designSessionGroups ?? []),
        ] as CreationGroup[];
        if (groups.length > 0) {
          const existingGroups = useEntityStore.getState().sessionGroups;
          upsertMany(
            "sessionGroups",
            groups.map((group) =>
              mergeSessionGroupEntity(existingGroups[group.id], group as SessionGroupEntity),
            ),
          );
          const sessions = groups.flatMap((group) => group.sessions ?? []);
          if (sessions.length > 0) upsertMany("sessions", sessions as SessionEntity[]);
        }
        useHomeDataStore
          .getState()
          .markGeneratedStatus(
            organizationId,
            baseResult.error || designResult?.error ? "error" : "ready",
          );
      } catch {
        if (active) useHomeDataStore.getState().markGeneratedStatus(organizationId, "error");
      }
    })();

    return () => {
      active = false;
    };
  }, [loadDesigns, organizationId, retryRequest, upsertMany]);
}
