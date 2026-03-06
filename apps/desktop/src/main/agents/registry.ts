import type { AgentType, AgentAdapter } from "./types";
import { ClaudeAdapter } from "./claude";
import { CodexAdapter } from "./codex";

const adapters = new Map<AgentType, AgentAdapter>();

adapters.set("claude", new ClaudeAdapter());
adapters.set("codex", new CodexAdapter());

export function getAgent(type: AgentType): AgentAdapter {
  const adapter = adapters.get(type);
  if (!adapter) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return adapter;
}

export function getAllAgents(): AgentAdapter[] {
  return Array.from(adapters.values());
}
