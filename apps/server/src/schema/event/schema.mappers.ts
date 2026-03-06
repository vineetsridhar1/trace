export interface EventMapper {
  id: string;
  cliSessionId: string;
  hookEventName: string;
  timestamp: Date;
  toolName: string | null;
  toolInput: unknown;
  toolResponse: unknown;
  toolUseId: string | null;
  stopHookActive: boolean | null;
  lastAssistantMessage: string | null;
  rawPayload: unknown;
  sessionId: string;
  importance: string;
}

export interface EventConnectionMapper {
  events: EventMapper[];
  total: number;
  limit: number;
  offset: number;
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  latestContextTokens?: number;
  cliCostUsd?: number;
}

export interface SessionEventPayloadMapper {
  channelId: string;
  workspaceId: string;
  sessionId: string;
  event: EventMapper;
}
