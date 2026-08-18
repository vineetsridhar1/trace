import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { SessionMessageService, sessionMessageCreateDataFromEvent } from "./session-message.js";

const timestamp = new Date("2026-08-17T12:00:00.000Z");

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    organizationId: "org-1",
    scopeType: "session",
    scopeId: "session-1",
    eventType: "session_output",
    payload: { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } },
    actorType: "system",
    actorId: "system",
    timestamp,
    ...overrides,
  } as never;
}

describe("session messages", () => {
  it("materializes assistant output with the Trace AI actor", () => {
    expect(sessionMessageCreateDataFromEvent(event())).toMatchObject({
      sessionId: "session-1",
      role: "assistant",
      actorType: "agent",
      actorId: TRACE_AI_USER_ID,
      text: "Hello",
      sourceEventId: "event-1",
    });
  });

  it("does not materialize non-conversational session output", () => {
    expect(
      sessionMessageCreateDataFromEvent(event({ payload: { type: "workspace_ready" } })),
    ).toBeNull();
  });

  it("does not materialize assistant tool output without text", () => {
    expect(
      sessionMessageCreateDataFromEvent(
        event({
          payload: {
            type: "assistant",
            message: { content: [{ type: "tool_use", name: "Bash", input: {} }] },
          },
        }),
      ),
    ).toBeNull();
  });

  it("uses a composite cursor when loading messages with identical timestamps", async () => {
    const service = new SessionMessageService();
    const prismaMock = prisma as unknown as {
      sessionMessage: { findMany: ReturnType<typeof vi.fn> };
    };
    prismaMock.sessionMessage.findMany.mockResolvedValue([]);

    await service.list("session-1", timestamp, "message-2", 50);

    expect(prismaMock.sessionMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId: "session-1",
          OR: [
            { createdAt: { lt: timestamp } },
            { AND: [{ createdAt: timestamp }, { id: { lt: "message-2" } }] },
          ],
        },
      }),
    );
  });
});
