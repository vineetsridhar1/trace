import type { AgentToolResult } from "@trace/client-core";

export interface NodeRenderContext {
  sessionId: string;
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
}
