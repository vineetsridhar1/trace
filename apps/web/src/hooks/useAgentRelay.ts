import { useCallback } from "react";
import { useInstance } from "../context/InstanceContext";

export interface SpawnAgentParams {
  workspaceId: string;
  prompt: string;
  channelId: string;
  model?: string;
  effort?: string;
  planMode?: boolean;

}

export interface AgentRelayActions {
  spawnAgent: (
    params: SpawnAgentParams,
  ) => Promise<{ success: boolean; error?: string }>;

  stopAgent: (
    workspaceId: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

export function useAgentRelay(): AgentRelayActions {
  const { relayAction } = useInstance();

  const spawnAgent = useCallback(
    async (
      params: SpawnAgentParams,
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await relayAction("spawnAgent", {
        workspaceId: params.workspaceId,
        prompt: params.prompt,
        channelId: params.channelId,
        model: params.model,
        effort: params.effort,
        planMode: params.planMode,

      });
      return { success: result.success, error: result.error ?? undefined };
    },
    [relayAction],
  );

  const stopAgent = useCallback(
    async (
      workspaceId: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await relayAction("stopAgent", { workspaceId });
      return { success: result.success, error: result.error ?? undefined };
    },
    [relayAction],
  );

  return { spawnAgent, stopAgent };
}
