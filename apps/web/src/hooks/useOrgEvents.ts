import { useEffect } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { handleOrgEvent, useAuthStore } from "@trace/client-core";
import { client } from "../lib/urql";

const ORG_EVENTS_SUBSCRIPTION = gql`
  subscription OrgEvents($organizationId: ID!) {
    orgEvents(organizationId: $organizationId) {
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

export function useOrgEvents() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);

  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(ORG_EVENTS_SUBSCRIPTION, { organizationId: activeOrgId })
      .subscribe((result: { error?: unknown; data?: Record<string, unknown> }) => {
        if (result.error) {
          console.error("[orgEvents] subscription error:", result.error);
        }
        if (!result.data?.orgEvents) return;
        handleOrgEvent(result.data.orgEvents as Event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId]);
}
