import { spawnAgent } from "./agents/spawnAgent";
import { stopAgentProcess } from "./worktree";
import { getChannelLocalConfig } from "./localConfig";
import { getAuthToken } from "./instanceConnection";
import { resolveServerUrl } from "./ipc/shared";

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

async function persistPromptToServer(
  channelId: string,
  workspaceId: string,
  text: string,
): Promise<boolean> {
  const serverUrl = resolveServerUrl();
  const token = getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${serverUrl}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `mutation AppendPrompt($channelId: ID!, $workspaceId: ID!, $text: String!) {
        appendPrompt(channelId: $channelId, workspaceId: $workspaceId, text: $text) {
          workspace { id }
        }
      }`,
      variables: { channelId, workspaceId, text },
    }),
  });

  if (!res.ok) return false;
  const body = (await res.json()) as { data?: { appendPrompt: unknown } };
  return !!body.data?.appendPrompt;
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
    persistPrompt,
  } = command.params as {
    workspaceId: string;
    prompt: string;
    channelId: string;
    model?: string;
    effort?: string;
    planMode?: boolean;
    persistPrompt?: boolean;
  };

  if (persistPrompt) {
    const persisted = await persistPromptToServer(channelId, workspaceId, prompt);
    if (!persisted) {
      return {
        id: command.id,
        type: "action-result",
        success: false,
        error: "Failed to persist prompt to server",
      };
    }
  }

  const localConfig = getChannelLocalConfig(channelId);
  if (!localConfig) {
    return {
      id: command.id,
      type: "action-result",
      success: false,
      error: `No local config found for channel ${channelId}`,
    };
  }

  const worktreePath = await spawnAgent({
    agentType: "claude",
    workspaceId,
    prompt,
    repoPath: localConfig.localRepoPath,
    creationCommands: localConfig.setupScript
      ? [localConfig.setupScript]
      : undefined,
    model,
    effort,
    systemInstructions: localConfig.systemInstructions,
    permissionMode: planMode ? "plan" : undefined,
  });

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
