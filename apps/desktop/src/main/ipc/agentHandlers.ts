import { ipcMain } from "electron";
import { spawnAgent } from "../agents/spawnAgent";
import { getAllAgents } from "../agents/registry";
import { stopAgentProcess } from "../worktree";
import { resetWatchdog, stopWatchdog } from "../watchdog";
import type { SpawnConfig } from "../../types";

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
