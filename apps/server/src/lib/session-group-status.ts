import type { SessionStatus } from "@prisma/client";

export type SessionGroupStatus =
  | "in_progress"
  | "needs_input"
  | "in_review"
  | "failed"
  | "stopped"
  | "merged"
  | "archived";

export type SessionGroupStatusSource = {
  sessionStatus: SessionStatus;
};

export function deriveSessionGroupStatus(
  sessions: Array<SessionGroupStatusSource | null | undefined>,
  archivedAt?: Date | string | null,
): SessionGroupStatus {
  if (archivedAt) return "archived";
  // Merged is terminal and takes priority over all other pipeline states.
  if (sessions.some((session) => session?.sessionStatus === "merged")) return "merged";
  if (sessions.some((session) => session?.sessionStatus === "needs_input")) {
    return "needs_input";
  }
  if (sessions.some((session) => session?.sessionStatus === "in_review")) return "in_review";
  if (sessions.some((session) => session?.sessionStatus === "in_progress")) return "in_progress";
  return "in_progress";
}
