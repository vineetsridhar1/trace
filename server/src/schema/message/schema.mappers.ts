import type { EventMapper } from '../event/schema.mappers';
import type { ThreadMapper } from '../thread/schema.mappers';

// _count.threads → threadCount via Message type resolver
export interface MessageMapper {
  id: string;
  channelId: string;
  sessionId: string;
  preview: string | null;
  importance: string;
  status: string;
  summary: string | null;
  branch: string | null;
  claudeSessionId: string | null;
  createdAt: Date;
  session: { sessionId: string; cwd: string | null; status: string } | null;
  _count: { threads: number };
}

export interface MessageSessionMapper {
  sessionId: string;
  cwd: string | null;
  status: string;
}

export interface MessageConnectionMapper {
  messages: MessageMapper[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateMessagePayloadMapper {
  message: MessageMapper;
  thread: ThreadMapper;
  event: EventMapper;
}
