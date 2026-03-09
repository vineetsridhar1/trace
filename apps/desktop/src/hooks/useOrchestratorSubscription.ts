import { useEffect } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { useAgentRunStore } from '../stores/agentRunStore';

const ORCHESTRATOR_TRIGGER_SUBSCRIPTION = gql`
  subscription OrchestratorTrigger($serverId: ID!) {
    orchestratorTrigger(serverId: $serverId) {
      channelId
      workspaceId
      newStatus
      ticketTitle
      orchestratorWorkspaceId
    }
  }
`;

interface UseOrchestratorSubscriptionOptions {
  activeServerId: string | null;
}

/**
 * Subscribes to orchestrator trigger events across all channels in the server.
 * When a non-orchestrator workspace changes to a significant status in a channel
 * with orchestrate mode enabled, the server publishes this event so the frontend
 * can spawn/re-trigger the orchestrator regardless of which channel is active.
 */
export function useOrchestratorSubscription({
  activeServerId,
}: UseOrchestratorSubscriptionOptions) {
  const skip = !activeServerId;
  const { data } = useSubscription(ORCHESTRATOR_TRIGGER_SUBSCRIPTION, {
    variables: { serverId: activeServerId ?? '' },
    skip,
  });

  useEffect(() => {
    if (!data?.orchestratorTrigger) return;

    const { channelId, ticketTitle, newStatus, orchestratorWorkspaceId } =
      data.orchestratorTrigger;
    const reason = `"${ticketTitle}" changed to ${newStatus}`;

    void useAgentRunStore
      .getState()
      .workspaceActions.triggerOrchestrator(reason, channelId, orchestratorWorkspaceId);
  }, [data]);
}
