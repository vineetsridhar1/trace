import { useEffect } from "react";
import { gql } from "@urql/core";
import { handleOrgEvent, useAuthStore } from "@trace/client-core";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";

const REVIEW_EVENTS_SUBSCRIPTION = gql`
  subscription ReviewEventsLive($reviewId: ID!, $organizationId: ID!) {
    reviewEvents(reviewId: $reviewId, organizationId: $organizationId) {
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

export function useReviewEvents(reviewId: string, active: boolean): void {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);

  useEffect(() => {
    if (!active || !activeOrgId) return;

    const subscription = client
      .subscription(REVIEW_EVENTS_SUBSCRIPTION, {
        reviewId,
        organizationId: activeOrgId,
      })
      .subscribe((result: { error?: unknown; data?: Record<string, unknown> }) => {
        if (result.error) {
          console.error("[reviewEvents] subscription error:", result.error);
        }
        const event = result.data?.reviewEvents;
        if (event) handleOrgEvent(event as Event);
      });

    return () => subscription.unsubscribe();
  }, [active, activeOrgId, reviewId]);
}
