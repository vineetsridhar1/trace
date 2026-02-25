export interface EventMapper {
  id: string;
  sessionId: string;
  hookEventName: string;
  timestamp: Date;
  toolName: string | null;
  toolInput: unknown;
  toolResponse: unknown;
  toolUseId: string | null;
  stopHookActive: boolean | null;
  lastAssistantMessage: string | null;
  rawPayload: unknown;
  threadId: string;
  importance: string;
}

export interface EventConnectionMapper {
  events: EventMapper[];
  total: number;
  limit: number;
  offset: number;
}
