/**
 * Session Monitor — provides session-specific helpers for the agent pipeline.
 *
 * The ambient AI observes coding session lifecycle events and provides useful
 * oversight: summarize progress to linked tickets, detect blocked/failed
 * sessions, and notify relevant people.
 *
 * This module does NOT run the pipeline — it provides enrichment functions
 * that the pipeline calls when processing session-scoped events.
 *
 * Ticket: #18
 * Dependencies: #09 (Entity Summaries), #15 (Pipeline Integration)
 */

import { prisma } from "../lib/db.js";
import type { AgentEvent } from "./router.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedTicketInfo {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  assignees: Array<{ id: string; name: string | null }>;
}

export interface SessionMonitorContext {
  sessionId: string;
  sessionName: string | null;
  linkedTickets: LinkedTicketInfo[];
  /** All unique assignee user IDs across all linked tickets. */
  assigneeIds: string[];
}

// ---------------------------------------------------------------------------
// Session context helpers
// ---------------------------------------------------------------------------

/**
 * Build session monitoring context from a session-scoped event.
 * Fetches linked tickets and their assignees for notification targeting.
 */
export async function buildSessionMonitorContext(
  sessionId: string,
): Promise<SessionMonitorContext | null> {
  const [session, ticketLinks] = await Promise.all([
    prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, name: true },
    }),
    prisma.ticketLink.findMany({
      where: { entityType: "session", entityId: sessionId },
      include: {
        ticket: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            assignees: { include: { user: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
  ]);

  if (!session) return null;

  const linkedTickets: LinkedTicketInfo[] = ticketLinks.map(
    (l: {
      ticket: {
        id: string;
        title: string;
        status: string;
        priority: string | null;
        assignees: Array<{ user: { id: string; name: string | null } }>;
      };
    }) => ({
      id: l.ticket.id,
      title: l.ticket.title,
      status: l.ticket.status,
      priority: l.ticket.priority,
      assignees: l.ticket.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
    }),
  );

  const assigneeIdSet = new Set<string>();
  for (const ticket of linkedTickets) {
    for (const assignee of ticket.assignees) {
      assigneeIdSet.add(assignee.id);
    }
  }

  return {
    sessionId: session.id,
    sessionName: session.name,
    linkedTickets,
    assigneeIds: [...assigneeIdSet],
  };
}

// ---------------------------------------------------------------------------
// Event classification helpers
// ---------------------------------------------------------------------------

/** Session events that indicate the session needs immediate attention. */
export function isBlockedSessionEvent(event: AgentEvent): boolean {
  if (event.scopeType !== "session") return false;

  if (event.eventType === "session_paused" && event.payload.needsInput === true) {
    return true;
  }
  if (event.eventType === "session_terminated" && event.payload.status === "failed") {
    return true;
  }
  if (event.eventType === "session_terminated" && event.payload.needsInput === true) {
    return true;
  }

  return false;
}

/** Session events that indicate the session completed successfully. */
export function isSessionCompletionEvent(event: AgentEvent): boolean {
  if (event.scopeType !== "session") return false;

  if (event.eventType === "session_terminated" && event.payload.status !== "failed") {
    return true;
  }
  if (event.eventType === "session_pr_opened") {
    return true;
  }

  return false;
}

/** Session events that carry progress output (should be summarized). */
export function isSessionProgressEvent(event: AgentEvent): boolean {
  if (event.scopeType !== "session") return false;
  return event.eventType === "session_output";
}

/**
 * Extract a human-readable description of what went wrong from a blocked/failed
 * session event payload. Used to populate notifications and ticket comments.
 */
export function extractBlockageInfo(event: AgentEvent): string {
  const parts: string[] = [];

  if (event.eventType === "session_paused") {
    parts.push("Session paused — needs human input.");
  } else if (event.eventType === "session_terminated" && event.payload.status === "failed") {
    parts.push("Session failed.");
  } else if (event.eventType === "session_terminated" && event.payload.needsInput === true) {
    parts.push("Session terminated — was waiting for input.");
  }

  const reason = event.payload.reason;
  if (typeof reason === "string" && reason) {
    parts.push(`Reason: ${reason}`);
  }

  const lastOutput = event.payload.lastOutput;
  if (typeof lastOutput === "string" && lastOutput) {
    parts.push(`Last output: ${lastOutput.slice(0, 500)}`);
  }

  return parts.join(" ") || "Session encountered an issue.";
}

/**
 * Extract a completion summary from a session completion event payload.
 */
export function extractCompletionInfo(event: AgentEvent): string {
  const parts: string[] = [];

  if (event.eventType === "session_pr_opened") {
    parts.push("PR opened.");
    const prUrl = event.payload.prUrl;
    if (typeof prUrl === "string") parts.push(`PR: ${prUrl}`);
    const prTitle = event.payload.prTitle;
    if (typeof prTitle === "string") parts.push(`Title: ${prTitle}`);
  } else if (event.eventType === "session_terminated") {
    parts.push("Session completed.");
  }

  const summary = event.payload.summary;
  if (typeof summary === "string" && summary) {
    parts.push(summary);
  }

  return parts.join(" ") || "Session completed successfully.";
}
