/**
 * Session Monitor — event classification and info extraction helpers for
 * session-scoped pipeline processing.
 *
 * The ambient AI observes coding session lifecycle events and provides useful
 * oversight: summarize progress to linked tickets, detect blocked/failed
 * sessions, and notify relevant people.
 *
 * Note: Linked ticket fetching is handled by the context builder's session
 * scope fetcher (context-builder.ts). This module provides pure classification
 * and extraction functions that don't query the database.
 *
 * Ticket: #18
 * Dependencies: #09 (Entity Summaries), #15 (Pipeline Integration)
 */

import type { AgentEvent } from "./router.js";

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

  if (
    event.eventType === "session_terminated" &&
    event.payload.status !== "failed" &&
    event.payload.needsInput !== true
  ) {
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
