import type { EventMapper } from "../event/schema.mappers";
import type { SessionMapper } from "../session/schema.mappers";

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
  agentSessionId: string | null;
  agentType: string | null;
  createdAt: Date;
  cliSession: { sessionId: string; cwd: string | null; status: string; permissionMode: string | null } | null;
  user: { id: string; name: string; avatarUrl: string | null } | null;
  _count: { sessions: number };
  isProductDoc: boolean;
  isOrchestrator: boolean;
  channel?: { id: string; name: string } | null;
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
  permissionMode: string | null;
}

export interface WorkspaceConnectionMapper {
  workspaces: WorkspaceMapper[];
  total: number;
  mergedCount: number;
  limit: number;
  offset: number;
}

export interface CreateWorkspacePayloadMapper {
  workspace: WorkspaceMapper;
  session: SessionMapper;
  event: EventMapper | null;
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

export interface PresenceUserMapper {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface WorkspacePresenceMapper {
  workspaceId: string;
  viewers: PresenceUserMapper[];
}

export interface PresencePayloadMapper {
  channelId: string;
  presence: WorkspacePresenceMapper[];
}
