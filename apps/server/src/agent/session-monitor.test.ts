import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", () => ({
  prisma: {
    session: { findUnique: vi.fn().mockResolvedValue(null) },
    ticketLink: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import {
  isBlockedSessionEvent,
  isSessionCompletionEvent,
  isSessionProgressEvent,
  extractBlockageInfo,
  extractCompletionInfo,
} from "./session-monitor.js";
import type { AgentEvent } from "./router.js";

function sessionEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: "evt-1",
    organizationId: "org-1",
    scopeType: "session",
    scopeId: "session-1",
    eventType: "session_output",
    actorType: "system",
    actorId: "system",
    payload: {},
    timestamp: "2026-03-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("isBlockedSessionEvent", () => {
  it("returns true for session_paused with needsInput", () => {
    expect(
      isBlockedSessionEvent(
        sessionEvent({ eventType: "session_paused", payload: { needsInput: true } }),
      ),
    ).toBe(true);
  });

  it("returns true for session_terminated with failed status", () => {
    expect(
      isBlockedSessionEvent(
        sessionEvent({ eventType: "session_terminated", payload: { status: "failed" } }),
      ),
    ).toBe(true);
  });

  it("returns true for session_terminated with needsInput", () => {
    expect(
      isBlockedSessionEvent(
        sessionEvent({ eventType: "session_terminated", payload: { needsInput: true } }),
      ),
    ).toBe(true);
  });

  it("returns false for normal session_paused", () => {
    expect(
      isBlockedSessionEvent(
        sessionEvent({ eventType: "session_paused", payload: {} }),
      ),
    ).toBe(false);
  });

  it("returns false for completed session_terminated", () => {
    expect(
      isBlockedSessionEvent(
        sessionEvent({ eventType: "session_terminated", payload: { status: "completed" } }),
      ),
    ).toBe(false);
  });

  it("returns false for non-session scope", () => {
    expect(
      isBlockedSessionEvent(
        sessionEvent({
          scopeType: "chat",
          eventType: "session_paused",
          payload: { needsInput: true },
        }),
      ),
    ).toBe(false);
  });

  it("returns false for session_output events", () => {
    expect(isBlockedSessionEvent(sessionEvent())).toBe(false);
  });
});

describe("isSessionCompletionEvent", () => {
  it("returns true for successful session_terminated", () => {
    expect(
      isSessionCompletionEvent(
        sessionEvent({ eventType: "session_terminated", payload: { status: "completed" } }),
      ),
    ).toBe(true);
  });

  it("returns true for session_pr_opened", () => {
    expect(
      isSessionCompletionEvent(sessionEvent({ eventType: "session_pr_opened" })),
    ).toBe(true);
  });

  it("returns false for failed session_terminated", () => {
    expect(
      isSessionCompletionEvent(
        sessionEvent({ eventType: "session_terminated", payload: { status: "failed" } }),
      ),
    ).toBe(false);
  });

  it("returns false for session_terminated with needsInput (blocked, not completed)", () => {
    expect(
      isSessionCompletionEvent(
        sessionEvent({ eventType: "session_terminated", payload: { needsInput: true } }),
      ),
    ).toBe(false);
  });

  it("returns false for non-session scope", () => {
    expect(
      isSessionCompletionEvent(
        sessionEvent({ scopeType: "chat", eventType: "session_pr_opened" }),
      ),
    ).toBe(false);
  });
});

describe("isSessionProgressEvent", () => {
  it("returns true for session_output", () => {
    expect(isSessionProgressEvent(sessionEvent())).toBe(true);
  });

  it("returns false for session_started", () => {
    expect(
      isSessionProgressEvent(sessionEvent({ eventType: "session_started" })),
    ).toBe(false);
  });

  it("returns false for non-session scope", () => {
    expect(
      isSessionProgressEvent(
        sessionEvent({ scopeType: "chat", eventType: "session_output" }),
      ),
    ).toBe(false);
  });
});

describe("extractBlockageInfo", () => {
  it("describes a paused session needing input", () => {
    const info = extractBlockageInfo(
      sessionEvent({ eventType: "session_paused", payload: { needsInput: true } }),
    );
    expect(info).toContain("paused");
    expect(info).toContain("needs human input");
  });

  it("describes a failed session", () => {
    const info = extractBlockageInfo(
      sessionEvent({
        eventType: "session_terminated",
        payload: { status: "failed", reason: "Build error" },
      }),
    );
    expect(info).toContain("failed");
    expect(info).toContain("Build error");
  });

  it("includes last output when available", () => {
    const info = extractBlockageInfo(
      sessionEvent({
        eventType: "session_paused",
        payload: { needsInput: true, lastOutput: "npm test failed with 3 errors" },
      }),
    );
    expect(info).toContain("npm test failed");
  });

  it("returns generic message for unknown event types", () => {
    const info = extractBlockageInfo(
      sessionEvent({ eventType: "session_started", payload: {} }),
    );
    expect(info).toBe("Session encountered an issue.");
  });
});

describe("extractCompletionInfo", () => {
  it("describes a PR being opened", () => {
    const info = extractCompletionInfo(
      sessionEvent({
        eventType: "session_pr_opened",
        payload: { prUrl: "https://github.com/org/app/pull/42", prTitle: "Fix login" },
      }),
    );
    expect(info).toContain("PR opened");
    expect(info).toContain("https://github.com/org/app/pull/42");
    expect(info).toContain("Fix login");
  });

  it("describes session completion", () => {
    const info = extractCompletionInfo(
      sessionEvent({
        eventType: "session_terminated",
        payload: { status: "completed", summary: "Fixed 3 tests" },
      }),
    );
    expect(info).toContain("completed");
    expect(info).toContain("Fixed 3 tests");
  });

  it("returns generic message for unknown event types", () => {
    const info = extractCompletionInfo(sessionEvent());
    expect(info).toBe("Session completed successfully.");
  });
});
