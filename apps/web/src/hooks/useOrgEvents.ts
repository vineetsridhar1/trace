import { useEffect } from "react";
import { gql } from "@urql/core";
import type { Event, EventType } from "@trace/gql";
import { handleOrgEvent, useAuthStore } from "@trace/client-core";
import { client } from "../lib/urql";

const ORG_EVENT_TYPES: EventType[] = [
  "repo_created",
  "repo_updated",
  "chat_created",
  "chat_renamed",
  "chat_member_added",
  "chat_member_removed",
  "queued_message_added",
  "queued_message_updated",
  "queued_message_removed",
  "queued_messages_cleared",
  "queued_messages_reordered",
  "queued_messages_drained",
  "agent_environment_created",
  "agent_environment_updated",
  "agent_environment_deleted",
  "channel_created",
  "channel_updated",
  "channel_member_added",
  "channel_member_removed",
  "channel_group_created",
  "channel_group_updated",
  "channel_group_deleted",
  "channel_deleted",
  "session_started",
  "session_deleted",
  "session_group_archived",
  "session_group_renamed",
  "session_paused",
  "session_resumed",
  "session_terminated",
  "session_pr_merged",
  "session_runtime_start_requested",
  "session_runtime_provisioning",
  "session_runtime_connecting",
  "session_runtime_connected",
  "session_runtime_start_failed",
  "session_runtime_start_timed_out",
  "session_runtime_stopping",
  "session_runtime_stopped",
  "session_runtime_deprovision_failed",
  "session_runtime_disconnected",
  "session_runtime_reconnected",
  "session_pr_opened",
  "session_pr_closed",
  "session_output",
  "message_sent",
  "inbox_item_created",
  "inbox_item_resolved",
];

const ORG_EVENTS_SUBSCRIPTION = gql`
  subscription OrgEvents($organizationId: ID!, $types: [String!]) {
    orgEvents(organizationId: $organizationId, types: $types) {
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
      .subscription(ORG_EVENTS_SUBSCRIPTION, { organizationId: activeOrgId, types: ORG_EVENT_TYPES })
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
