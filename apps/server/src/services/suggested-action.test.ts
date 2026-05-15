import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", () => ({
  prisma: {
    session: { findFirst: vi.fn() },
    suggestedAction: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn() },
}));

vi.mock("./session.js", () => ({
  sessionService: {
    sendMessage: vi.fn(),
    start: vi.fn(),
  },
}));

vi.mock("./org-member.js", () => ({
  orgMemberService: { assertAdmin: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionService } from "./session.js";
import { orgMemberService } from "./org-member.js";
import { suggestedActionService } from "./suggested-action.js";

const action = {
  id: "suggestion-1",
  organizationId: "org-1",
  assistantSessionId: "assistant-1",
  status: "approved",
  actionType: "send_session_message",
  targetType: "session",
  targetId: "session-1",
  input: { body: "hello" },
  rationale: null,
  proposedByActorType: "agent",
  proposedByActorId: "agent-1",
  approvedByActorType: "user",
  approvedByActorId: "user-1",
  approvedAt: new Date("2026-01-01T00:00:00.000Z"),
  dismissedByActorType: null,
  dismissedByActorId: null,
  dismissedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as const;

describe("SuggestedActionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires admin and atomically claims approval before executing", async () => {
    vi.mocked(prisma.suggestedAction.updateMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.suggestedAction.findFirst).mockResolvedValueOnce(action);

    await suggestedActionService.approve("suggestion-1", "org-1", "user-1");

    expect(orgMemberService.assertAdmin).toHaveBeenCalledWith("user-1", "org-1");
    expect(prisma.suggestedAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "suggestion-1", organizationId: "org-1", status: "pending" },
        data: expect.objectContaining({ status: "approved" }),
      }),
    );
    expect(sessionService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1", text: "hello", actorId: "user-1" }),
    );
    expect(eventService.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "suggested_action_approved" }),
    );
  });

  it("does not execute an already-handled suggestion", async () => {
    vi.mocked(prisma.suggestedAction.updateMany).mockResolvedValueOnce({ count: 0 });
    vi.mocked(prisma.suggestedAction.findFirst).mockResolvedValueOnce({
      ...action,
      status: "approved",
    });

    await expect(
      suggestedActionService.approve("suggestion-1", "org-1", "user-1"),
    ).rejects.toThrow("Suggested action is not pending");

    expect(sessionService.sendMessage).not.toHaveBeenCalled();
  });
});
