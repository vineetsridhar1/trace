import type { AgentStatus, SessionStatus, TicketStatus } from "@trace/gql";
import { relativeTime, shortId } from "./output.js";

// Runtime value lists for the schema's type-only enums; `satisfies` keeps them
// in lockstep with @trace/gql — a schema change fails the typecheck here.
export const AGENT_STATUSES = [
  "not_started",
  "active",
  "done",
  "failed",
  "stopped",
] as const satisfies readonly AgentStatus[];

export const SESSION_STATUSES = [
  "in_progress",
  "needs_input",
  "in_review",
  "merged",
] as const satisfies readonly SessionStatus[];

export const TICKET_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
] as const satisfies readonly TicketStatus[];

export interface SessionListItem {
  id: string;
  name: string;
  agentStatus: AgentStatus;
  sessionStatus: SessionStatus;
  tool: string;
  branch: string | null;
  updatedAt: string;
  repo: { name: string } | null;
}

export function sessionToJson(session: SessionListItem) {
  return {
    id: session.id,
    name: session.name,
    agentStatus: session.agentStatus,
    sessionStatus: session.sessionStatus,
    tool: session.tool,
    repo: session.repo?.name ?? null,
    branch: session.branch ?? null,
    updatedAt: session.updatedAt,
  };
}

export function sessionToRow(session: SessionListItem, now?: number): string[] {
  const repoBranch = session.repo
    ? `${session.repo.name}${session.branch ? `#${session.branch}` : ""}`
    : "-";
  return [
    shortId(session.id),
    session.name,
    session.agentStatus,
    session.sessionStatus,
    session.tool,
    repoBranch,
    relativeTime(session.updatedAt, now),
  ];
}

export const SESSION_HEADER = ["ID", "NAME", "AGENT", "STATUS", "TOOL", "REPO", "UPDATED"];

export interface ChannelListItem {
  id: string;
  name: string;
  type: string;
  memberCount: number;
}

export function channelToJson(channel: ChannelListItem) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    memberCount: channel.memberCount,
  };
}

export function channelToRow(channel: ChannelListItem): string[] {
  return [shortId(channel.id), channel.name, channel.type, String(channel.memberCount)];
}

export const CHANNEL_HEADER = ["ID", "NAME", "TYPE", "MEMBERS"];

export interface TicketListItem {
  id: string;
  title: string;
  status: TicketStatus;
  priority: string;
  updatedAt: string;
}

export function ticketToJson(ticket: TicketListItem) {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    updatedAt: ticket.updatedAt,
  };
}

export function ticketToRow(ticket: TicketListItem, now?: number): string[] {
  return [
    shortId(ticket.id),
    ticket.title,
    ticket.status,
    ticket.priority,
    relativeTime(ticket.updatedAt, now),
  ];
}

export const TICKET_HEADER = ["ID", "TITLE", "STATUS", "PRIORITY", "UPDATED"];

export interface ChannelMessageItem {
  id: string;
  text: string;
  createdAt: string;
  actor: { type: string; id: string; name: string | null };
}

export function messageToJson(message: ChannelMessageItem) {
  return {
    id: message.id,
    actor: {
      type: message.actor.type,
      id: message.actor.id,
      name: message.actor.name ?? null,
    },
    text: message.text,
    createdAt: message.createdAt,
  };
}

export function messageToLine(message: ChannelMessageItem): string {
  const stamp = message.createdAt.slice(0, 16).replace("T", " ");
  const actor = message.actor.name ?? message.actor.id;
  return `[${stamp}] ${actor}: ${message.text}`;
}
