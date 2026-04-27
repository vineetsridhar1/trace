import type { AgentStatus, SessionStatus } from "@prisma/client";

export type SessionGroupStatus =
  | "in_progress"
  | "needs_input"
  | "in_review"
  | "failed"
  | "stopped"
  | "merged"
  | "archived";

export type SessionGroupStatusSource = {
  agentStatus: AgentStatus;
  sessionStatus: SessionStatus;
};

export function deriveSessionGroupStatus(
  sessions: Array<SessionGroupStatusSource | null | undefined>,
  prUrl: string | null | undefined,
  archivedAt?: Date | string | null,
): SessionGroupStatus {
  if (archivedAt) return "archived";
  // Merged is terminal and takes priority over all other states,
  // including needs_input and in_review (which depends on prUrl).
  if (sessions.some((session) => session?.sessionStatus === "merged")) return "merged";
  if (sessions.some((session) => session?.sessionStatus === "needs_input")) {
    return "needs_input";
  }
  if (prUrl) return "in_review";
  if (
    sessions.some(
      (session) => session?.agentStatus === "active" || session?.sessionStatus === "in_progress",
    )
  ) {
    return "in_progress";
  }
  if (sessions.some((session) => session?.agentStatus === "failed")) return "failed";
  if (sessions.some((session) => session?.agentStatus === "stopped")) return "stopped";
  return "in_progress";
}
