import type { GitCheckpoint } from "@trace/gql";
import type { AgentToolResult } from "@trace/client-core";

export interface NodeRenderContext {
  sessionId: string;
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>;
  /** Session is actively streaming — drives the assistant streaming cursor. */
  sessionActive: boolean;
}
