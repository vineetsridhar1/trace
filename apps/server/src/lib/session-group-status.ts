import type { AgentStatus, SessionStatus } from "@prisma/client";

export type SessionGroupStatus =
  | "in_progress"
  | "needs_input"
  | "in_review"
  | "failed"
  | "stopped"
  | "merged";

export type SessionGroupStatusSource = {
  agentStatus: AgentStatus;
  sessionStatus: SessionStatus;
};

export function deriveSessionGroupStatus(
  sessions: Array<SessionGroupStatusSource | null | undefined>,
  prUrl: string | null | undefined,
): SessionGroupStatus {
  if (sessions.some((session) => session?.sessionStatus === "needs_input")) {
    return "needs_input";
  }
  if (prUrl) return "in_review";
  if (
    sessions.some(
      (session) =>
        session?.agentStatus === "active" || session?.sessionStatus === "in_progress",
    )
  ) {
    return "in_progress";
  }
  if (sessions.some((session) => session?.agentStatus === "failed")) return "failed";
  if (sessions.some((session) => session?.agentStatus === "stopped")) return "stopped";
  if (sessions.some((session) => session?.sessionStatus === "merged")) return "merged";
  return "in_progress";
}

export function deriveSessionGroupAgentStatus(
  agentStatuses: Array<AgentStatus | null | undefined>,
): AgentStatus {
  if (agentStatuses.some((status) => status === "active")) return "active";
  if (agentStatuses.some((status) => status === "failed")) return "failed";
  if (agentStatuses.some((status) => status === "stopped")) return "stopped";
  if (agentStatuses.length > 0 && agentStatuses.every((status) => status === "not_started")) {
    return "not_started";
  }
  if (agentStatuses.some((status) => status === "done")) return "done";
  return "done";
}
