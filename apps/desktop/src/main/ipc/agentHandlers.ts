import { ipcMain } from "electron";
import { spawnAgent } from "../agents/spawnAgent";
import { getAllAgents } from "../agents/registry";
import { stopAgentProcess } from "../worktree";
import { resetWatchdog, stopWatchdog } from "../watchdog";
import { getChannelLocalConfig } from "../localConfig";
import { registerRelayAction } from "../instanceCommandHandler";
import type { SpawnConfig } from "../../types";
import type { AgentType } from "../../types";

const SPAWN_AGENT_CHANNEL = "spawn-agent";
const STOP_AGENT_CHANNEL = "stop-agent";
const DETECT_AGENTS_CHANNEL = "detect-agents";
const AGENT_ACTIVITY_PING_CHANNEL = "agent-activity-ping";

export function registerAgentHandlers(): void {
  ipcMain.removeHandler(SPAWN_AGENT_CHANNEL);
  ipcMain.handle(SPAWN_AGENT_CHANNEL, async (_event, config: SpawnConfig) => {
    try {
      const worktreePath = await spawnAgent(config);
      return { success: true, worktreePath };
    } catch (err) {
      console.error("Failed to spawn agent:", err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.removeHandler(STOP_AGENT_CHANNEL);
  ipcMain.handle(STOP_AGENT_CHANNEL, (_event, workspaceId: string) => {
    try {
      const result = stopAgentProcess(workspaceId);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.removeHandler(DETECT_AGENTS_CHANNEL);
  ipcMain.handle(DETECT_AGENTS_CHANNEL, async () => {
    try {
      const agents = getAllAgents();
      const results = await Promise.all(
        agents.map(async (adapter) => ({
          type: adapter.type,
          capabilities: adapter.capabilities,
          detectResult: await adapter.detect(),
        })),
      );
      return { success: true, agents: results };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.removeHandler(AGENT_ACTIVITY_PING_CHANNEL);
  ipcMain.handle(
    AGENT_ACTIVITY_PING_CHANNEL,
    async (_event, workspaceId: string, eventType: string) => {
      try {
        if ((eventType ?? "").toLowerCase() === "stop") {
          stopWatchdog(workspaceId, "activity-stop-event");
        } else {
          resetWatchdog(workspaceId, `activity-event:${eventType}`);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );
}

export function registerAgentRelayActions(): void {
  registerRelayAction("spawnAgent", async (params) => {
    const {
      workspaceId,
      prompt,
      channelId,
      channelName,
      model,
      effort,
      planMode,
    } = params as {
      workspaceId: string;
      prompt: string;
      channelId: string;
      channelName?: string;
      model?: string;
      effort?: string;
      planMode?: boolean;
    };

    const localConfig = getChannelLocalConfig(channelId);
    if (!localConfig) {
      return { success: false, error: `No local config found for channel ${channelId}` };
    }

    const agentType: AgentType = "claude";
    const worktreePath = await spawnAgent({
      agentType,
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
      channelId,
      channelName,
    });

    return { success: true, worktreePath };
  });

  registerRelayAction("stopAgent", async (params) => {
    const { workspaceId } = params as { workspaceId: string };
    stopAgentProcess(workspaceId);
    return { success: true };
  });

  registerRelayAction("detectAgents", async () => {
    const agents = getAllAgents();
    const results = await Promise.all(
      agents.map(async (adapter) => ({
        type: adapter.type,
        capabilities: adapter.capabilities,
        detectResult: await adapter.detect(),
      })),
    );
    return { success: true, agents: results };
  });

  registerRelayAction("reportAgentActivity", async (params) => {
    const { workspaceId, eventType } = params as {
      workspaceId: string;
      eventType: string;
    };
    if ((eventType ?? "").toLowerCase() === "stop") {
      stopWatchdog(workspaceId, "activity-stop-event");
    } else {
      resetWatchdog(workspaceId, `activity-event:${eventType}`);
    }
    return { success: true };
  });
}
