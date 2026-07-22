import { useEffect } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { handleUserEvent, useAuthStore } from "@trace/client-core";
import { client } from "../lib/urql";

const USER_EVENTS_SUBSCRIPTION = gql`
  subscription UserEvents($organizationId: ID!) {
    userEvents(organizationId: $organizationId) {
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

export function useUserEvents() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);

  useEffect(() => {
    if (!activeOrgId) return;
    const subscription = client
      .subscription(USER_EVENTS_SUBSCRIPTION, { organizationId: activeOrgId })
      .subscribe((result) => {
        if (result.error) {
          console.error("[userEvents] subscription error:", result.error);
        }
        if (result.data?.userEvents) {
          handleUserEvent(result.data.userEvents as Event);
        }
      });
    return () => subscription.unsubscribe();
  }, [activeOrgId]);
}
