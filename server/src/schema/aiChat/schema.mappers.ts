export interface AiChatMapper {
  id: string;
  serverId: string;
  channelId: string | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: { content: string }[];
}

export interface AiChatMessageMapper {
  id: string;
  chatId: string;
  role: string;
  content: string;
  createdAt: Date;
}

export interface AiChatMessageConnectionMapper {
  messages: AiChatMessageMapper[];
  total: number;
  limit: number;
  offset: number;
}

export interface AiChatStreamPayloadMapper {
  chatId: string;
  type: string;
  delta?: string | null;
  content?: string | null;
  error?: string | null;
}
