import { spawnAgent } from "./agents/spawnAgent";
import { stopAgentProcess } from "./worktree";
import { getChannelLocalConfig } from "./localConfig";
import type { AgentType } from "./agents/types";

export interface RelayCommand {
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export interface RelayResult {
  id: string;
  type: "action-result";
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

async function handleSpawnAgent(
  command: RelayCommand,
): Promise<RelayResult> {
  const {
    workspaceId,
    prompt,
    channelId,
    model,
    effort,
    planMode,
  } = command.params as {
    workspaceId: string;
    prompt: string;
    channelId: string;
    model?: string;
    effort?: string;
    planMode?: boolean;
  };

  const localConfig = getChannelLocalConfig(channelId);
  if (!localConfig) {
    return {
      id: command.id,
      type: "action-result",
      success: false,
      error: `No local config found for channel ${channelId}`,
    };
  }

  const repoPath = localConfig.localRepoPath;
  const creationCommands = localConfig.setupScript
    ? [localConfig.setupScript]
    : undefined;
  const systemInstructions = localConfig.systemInstructions;

  const agentType: AgentType = "claude";

  const worktreePath = await spawnAgent(
    agentType,
    workspaceId,
    prompt,
    repoPath,
    creationCommands,
    undefined, // resumeSessionId
    undefined, // filePaths
    model,
    effort,
    systemInstructions,
    planMode ? "plan" : undefined, // permissionMode
  );

  return {
    id: command.id,
    type: "action-result",
    success: true,
    data: { worktreePath },
  };
}

function handleStopAgent(command: RelayCommand): RelayResult {
  const { workspaceId } = command.params as { workspaceId: string };

  stopAgentProcess(workspaceId);

  return {
    id: command.id,
    type: "action-result",
    success: true,
  };
}

export async function handleRelayCommand(
  command: RelayCommand,
): Promise<RelayResult> {
  try {
    switch (command.action) {
      case "spawnAgent":
        return await handleSpawnAgent(command);
      case "stopAgent":
        return handleStopAgent(command);
      default:
        return {
          id: command.id,
          type: "action-result",
          success: false,
          error: "UNKNOWN_ACTION",
        };
    }
  } catch (err) {
    return {
      id: command.id,
      type: "action-result",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
