import { useEffect } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { eventScopeKey, useAuthStore, useEntityStore } from "@trace/client-core";
import { client } from "../lib/urql";

const PROJECT_ACTIVITY_LIMIT = 50;

const PROJECT_EVENTS_QUERY = gql`
  query ProjectEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {
    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
        name
        avatarUrl
      }
      parentId
      timestamp
      metadata
    }
  }
`;

export function useProjectEvents(projectId: string | null) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsertManyScopedEvents = useEntityStore((s) => s.upsertManyScopedEvents);

  useEffect(() => {
    if (!activeOrgId || !projectId) return;

    let cancelled = false;
    const scopeKey = eventScopeKey("project", projectId);

    client
      .query(PROJECT_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "project", id: projectId },
        limit: PROJECT_ACTIVITY_LIMIT,
        before: new Date().toISOString(),
      })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          console.error("[projectEvents] query error:", result.error.message);
          return;
        }
        if (!Array.isArray(result.data?.events)) return;
        upsertManyScopedEvents(scopeKey, result.data.events as Array<Event & { id: string }>);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("[projectEvents] query failed:", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, projectId, upsertManyScopedEvents]);
}
