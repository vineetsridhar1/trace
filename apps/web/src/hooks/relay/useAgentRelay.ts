import { useCallback } from "react";
import { useInstance } from "../../context/InstanceContext";
import { typedRelay } from "./useRelayAction";
import type {
  SpawnAgentParams,
  DetectAgentsResult,
  ReportAgentActivityParams,
} from "./types";

export type { SpawnAgentParams };

export interface AgentRelayActions {
  spawnAgent: (
    params: SpawnAgentParams,
  ) => Promise<{ success: boolean; error?: string }>;

  stopAgent: (
    workspaceId: string,
  ) => Promise<{ success: boolean; error?: string }>;

  detectAgents: () => Promise<{
    success: boolean;
    data?: DetectAgentsResult;
    error?: string;
  }>;

  reportAgentActivity: (
    params: ReportAgentActivityParams,
  ) => Promise<{ success: boolean; error?: string }>;
}

export function useAgentRelay(): AgentRelayActions {
  const { relayAction } = useInstance();

  const spawnAgent = useCallback(
    async (params: SpawnAgentParams) => {
      const result = await typedRelay(relayAction, "spawnAgent", {
        workspaceId: params.workspaceId,
        prompt: params.prompt,
        channelId: params.channelId,
        model: params.model,
        effort: params.effort,
        planMode: params.planMode,
      });
      return { success: result.success, error: result.error };
    },
    [relayAction],
  );

  const stopAgent = useCallback(
    async (workspaceId: string) => {
      const result = await typedRelay(relayAction, "stopAgent", { workspaceId });
      return { success: result.success, error: result.error };
    },
    [relayAction],
  );

  const detectAgents = useCallback(async () => {
    const result = await typedRelay<DetectAgentsResult>(
      relayAction,
      "detectAgents",
      {},
    );
    return { success: result.success, data: result.data, error: result.error };
  }, [relayAction]);

  const reportAgentActivity = useCallback(
    async (params: ReportAgentActivityParams) => {
      const result = await typedRelay(relayAction, "reportAgentActivity", {
        workspaceId: params.workspaceId,
        eventType: params.eventType,
      });
      return { success: result.success, error: result.error };
    },
    [relayAction],
  );

  return { spawnAgent, stopAgent, detectAgents, reportAgentActivity };
}
