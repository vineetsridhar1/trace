import type { EventMapper } from '../event/schema.mappers';
import type { SessionMapper } from '../session/schema.mappers';

// _count.sessions → sessionCount via Workspace type resolver
export interface WorkspaceMapper {
  id: string;
  channelId: string;
  cliSessionId: string;
  userId: string | null;
  preview: string | null;
  importance: string;
  status: string;
  summary: string | null;
  branch: string | null;
  claudeSessionId: string | null;
  createdAt: Date;
  cliSession: { sessionId: string; cwd: string | null; status: string } | null;
  user: { id: string; name: string; avatarUrl: string | null } | null;
  _count: { sessions: number };
}

export interface WorkspaceUserMapper {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface WorkspaceCliSessionMapper {
  sessionId: string;
  cwd: string | null;
  status: string;
}

export interface WorkspaceConnectionMapper {
  workspaces: WorkspaceMapper[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateWorkspacePayloadMapper {
  workspace: WorkspaceMapper;
  session: SessionMapper;
  event: EventMapper;
}

export interface WorkspaceDeletedPayloadMapper {
  channelId: string;
  workspaceId: string;
}

export interface PRStatusMapper {
  branch: string;
  hasPR: boolean;
  merged: boolean;
  prUrl: string | null;
}
