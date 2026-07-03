import type { EntityState } from "@trace/client-core/headless";

/** Documented protocol shapes — stable field sets, not raw GraphQL types. */

export interface SessionSnapshot {
  id: string;
  name: string;
  agentStatus: string;
  sessionStatus: string;
  tool: string;
  model: string | null;
  repo: { id: string; name: string } | null;
  branch: string | null;
  workdir: string | null;
  runtimeLabel: string | null;
  connectionState: string | null;
  sessionGroupId: string | null;
  prUrl: string | null;
  worktreeDeleted: boolean;
  lastMessageAt: string | null;
  lastEventPreview: string | null;
  updatedAt: string | null;
}

export function sessionSnapshots(state: EntityState): SessionSnapshot[] {
  return Object.values(state.sessions)
    .map((session) => ({
      id: session.id,
      name: session.name,
      agentStatus: session.agentStatus,
      sessionStatus: session.sessionStatus,
      tool: session.tool,
      model: session.model ?? null,
      repo: session.repo ? { id: session.repo.id, name: session.repo.name } : null,
      branch: session.branch ?? null,
      workdir: session.workdir ?? null,
      runtimeLabel: session.connection?.runtimeLabel ?? null,
      connectionState: session.connection?.state ?? null,
      sessionGroupId: session.sessionGroupId ?? null,
      prUrl: session.prUrl ?? null,
      worktreeDeleted: session.worktreeDeleted ?? false,
      lastMessageAt: session.lastMessageAt ?? null,
      lastEventPreview: session._lastEventPreview ?? null,
      updatedAt: session.updatedAt ?? null,
    }))
    .sort((a, b) =>
      (b.lastMessageAt ?? b.updatedAt ?? "").localeCompare(a.lastMessageAt ?? a.updatedAt ?? ""),
    );
}

export function channelSnapshots(state: EntityState) {
  return Object.values(state.channels).map((channel) => ({
    id: channel.id,
    name: channel.name,
    type: channel.type,
    memberCount: channel.memberCount ?? 0,
    repo: channel.repo ? { id: channel.repo.id, name: channel.repo.name } : null,
  }));
}

export function ticketSnapshots(state: EntityState) {
  return Object.values(state.tickets).map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    updatedAt: ticket.updatedAt ?? null,
  }));
}

export function repoSnapshots(state: EntityState) {
  return Object.values(state.repos).map((repo) => ({ id: repo.id, name: repo.name }));
}
