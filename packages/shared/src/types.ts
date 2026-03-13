export const SessionStatus = {
  Active: "active",
  Paused: "paused",
  Completed: "completed",
  Failed: "failed",
  Unreachable: "unreachable",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const TicketStatus = {
  Backlog: "backlog",
  Todo: "todo",
  InProgress: "in_progress",
  InReview: "in_review",
  Done: "done",
  Cancelled: "cancelled",
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const Priority = {
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const HostingMode = {
  Cloud: "cloud",
  Local: "local",
} as const;
export type HostingMode = (typeof HostingMode)[keyof typeof HostingMode];

export const CodingTool = {
  ClaudeCode: "claude-code",
  Cursor: "cursor",
  Custom: "custom",
} as const;
export type CodingTool = (typeof CodingTool)[keyof typeof CodingTool];

export const ChannelType = {
  Default: "default",
  Announcement: "announcement",
  Triage: "triage",
  Feed: "feed",
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const ScopeType = {
  Channel: "channel",
  Session: "session",
  Ticket: "ticket",
  System: "system",
} as const;
export type ScopeType = (typeof ScopeType)[keyof typeof ScopeType];

export const ActorType = {
  User: "user",
  Agent: "agent",
  System: "system",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const UserRole = {
  Admin: "admin",
  Member: "member",
  Observer: "observer",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AgentTrustLevel = {
  Autonomous: "autonomous",
  Suggest: "suggest",
  Blocked: "blocked",
} as const;
export type AgentTrustLevel = (typeof AgentTrustLevel)[keyof typeof AgentTrustLevel];
