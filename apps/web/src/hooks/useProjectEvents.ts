import { useEffect } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { handleOrgEvent, useAuthStore } from "@trace/client-core";
import { client } from "../lib/urql";

const PROJECT_EVENTS_SUBSCRIPTION = gql`
  subscription ProjectEvents($projectId: ID!, $organizationId: ID!) {
    projectEvents(projectId: $projectId, organizationId: $organizationId) {
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

  useEffect(() => {
    if (!activeOrgId || !projectId) return;

    const subscription = client
      .subscription(PROJECT_EVENTS_SUBSCRIPTION, { projectId, organizationId: activeOrgId })
      .subscribe((result: { error?: unknown; data?: Record<string, unknown> }) => {
        if (result.error) {
          console.error("[projectEvents] subscription error:", result.error);
        }
        if (!result.data?.projectEvents) return;
        handleOrgEvent(result.data.projectEvents as Event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, projectId]);
}
