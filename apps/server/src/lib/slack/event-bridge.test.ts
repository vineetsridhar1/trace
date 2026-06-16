import type { Event as PrismaEvent } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const slackMocks = vi.hoisted(() => ({
  postMessage: vi.fn(),
  update: vi.fn(),
}));

type EventEnvelope = { sessionEvents: PrismaEvent };

function createEventSource<T>() {
  const queue: T[] = [];
  const waiters: Array<(value: IteratorResult<T>) => void> = [];
  let done = false;

  return {
    iterator: {
      next(): Promise<IteratorResult<T>> {
        if (done) return Promise.resolve({ value: undefined as T, done: true });
        const value = queue.shift();
        if (value) return Promise.resolve({ value, done: false });
        return new Promise((resolve) => waiters.push(resolve));
      },
      return(): Promise<IteratorResult<T>> {
        done = true;
        for (const resolve of waiters.splice(0)) {
          resolve({ value: undefined as T, done: true });
        }
        return Promise.resolve({ value: undefined as T, done: true });
      },
      throw(error: Error): Promise<IteratorResult<T>> {
        done = true;
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } satisfies AsyncIterableIterator<T>,
    push(value: T): void {
      if (done) return;
      const resolve = waiters.shift();
      if (resolve) {
        resolve({ value, done: false });
        return;
      }
      queue.push(value);
    },
    reset(): void {
      done = false;
      queue.length = 0;
      waiters.length = 0;
    },
  };
}

const eventSource = vi.hoisted(() => createEventSource<EventEnvelope>());

vi.mock("../pubsub.js", () => ({
  pubsub: {
    asyncIterator: vi.fn(() => eventSource.iterator),
  },
  topics: {
    sessionEvents: (sessionId: string) => `session:${sessionId}:events`,
  },
}));

vi.mock("../db.js", async () => {
  const { createPrismaMock } = await import("../../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./client.js", () => ({
  getSlackClient: vi.fn(async () => ({
    chat: {
      postMessage: slackMocks.postMessage,
      update: slackMocks.update,
    },
  })),
}));

import { slackEventBridge } from "./event-bridge.js";
import { prisma } from "../db.js";

const endpointFindMany = prisma.sessionEndpoint.findMany as unknown as ReturnType<typeof vi.fn>;

function makeAssistantEvent(text: string): PrismaEvent {
  return {
    eventType: "session_output",
    actorType: "agent",
    payload: {
      type: "assistant",
      message: { content: [{ type: "text", text }] },
    },
  } as unknown as PrismaEvent;
}

function makeSlackUserEvent(text: string): PrismaEvent {
  return {
    eventType: "message_sent",
    actorType: "user",
    actorId: "user-1",
    payload: {
      clientSource: "slack",
      text,
    },
  } as unknown as PrismaEvent;
}

async function waitForBridge(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("SlackEventBridgeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventSource.reset();
    slackMocks.update.mockResolvedValue({});
    slackMocks.postMessage
      .mockResolvedValueOnce({ ts: "1710000000.000200" })
      .mockResolvedValueOnce({ ts: "1710000000.000300" });
  });

  afterEach(() => {
    slackEventBridge.detach("session-1");
    slackEventBridge.detachGroup("group-1");
  });

  it("starts a new assistant Slack message block after a Slack user message", async () => {
    slackEventBridge.attach("session-1", {
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000000.000100",
    });

    eventSource.push({ sessionEvents: makeAssistantEvent("Working") });
    await waitForBridge();
    eventSource.push({ sessionEvents: makeAssistantEvent("Still working") });
    await waitForBridge();
    eventSource.push({ sessionEvents: makeSlackUserEvent("new prompt") });
    await waitForBridge();
    eventSource.push({ sessionEvents: makeAssistantEvent("New answer") });
    await waitForBridge();
    eventSource.push({ sessionEvents: makeAssistantEvent("Final new answer") });
    await waitForBridge();

    expect(slackMocks.postMessage).toHaveBeenCalledTimes(2);
    expect(slackMocks.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ text: "Working" }),
    );
    expect(slackMocks.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "New answer" }),
    );
    expect(slackMocks.update).toHaveBeenCalledTimes(2);
    expect(slackMocks.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ ts: "1710000000.000200", text: "Still working" }),
    );
    expect(slackMocks.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ts: "1710000000.000300", text: "Final new answer" }),
    );
  });

  it("relays application workflow links and summary to the bound thread", async () => {
    slackMocks.postMessage.mockReset();
    slackMocks.postMessage.mockResolvedValue({ ts: "1710000000.000400" });
    endpointFindMany.mockResolvedValue([{ key: "abc123def456", label: "Rails server" }]);

    slackEventBridge.attachGroup("group-1", {
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000000.000100",
    });

    eventSource.push({
      sessionEvents: {
        eventType: "session_endpoint_forwarding_enabled",
        payload: { endpoint: { url: "http://abc123def456.preview.localhost", label: "Rails server" } },
      } as unknown as PrismaEvent,
    });
    await waitForBridge();

    eventSource.push({
      sessionEvents: {
        eventType: "session_application_workflow_completed",
        payload: { workflow: { id: "run-1" } },
      } as unknown as PrismaEvent,
    });
    await waitForBridge();

    // After the terminal workflow event the group subscription detaches, so a
    // later endpoint event is ignored rather than posted to the thread.
    eventSource.push({
      sessionEvents: {
        eventType: "session_endpoint_forwarding_enabled",
        payload: { endpoint: { url: "http://later.preview.localhost", label: "Late" } },
      } as unknown as PrismaEvent,
    });
    await waitForBridge();

    expect(slackMocks.postMessage).toHaveBeenCalledTimes(2);
    expect(slackMocks.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: "🔗 *Rails server* is live: <http://abc123def456.preview.localhost|open>",
      }),
    );
    expect(slackMocks.postMessage.mock.calls[1]?.[0]?.text).toContain("up and running");
    expect(slackMocks.postMessage.mock.calls[1]?.[0]?.text).toContain(
      "<http://abc123def456.preview.localhost|Rails server>",
    );
  });

  it("posts a step checklist and updates it in place as the workflow advances", async () => {
    slackMocks.postMessage.mockReset();
    slackMocks.update.mockReset();
    slackMocks.postMessage.mockResolvedValue({ ts: "1710000000.000700" });
    slackMocks.update.mockResolvedValue({});

    slackEventBridge.attachGroup("group-1", {
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000000.000100",
    });

    eventSource.push({
      sessionEvents: {
        eventType: "session_application_workflow_started",
        payload: {
          workflow: {
            steps: [
              { label: "Bundle install", status: "running" },
              { label: "Rails server", status: "pending" },
            ],
          },
        },
      } as unknown as PrismaEvent,
    });
    await waitForBridge();

    eventSource.push({
      sessionEvents: {
        eventType: "session_application_workflow_updated",
        payload: {
          workflow: {
            steps: [
              { label: "Bundle install", status: "completed" },
              { label: "Rails server", status: "running" },
            ],
          },
        },
      } as unknown as PrismaEvent,
    });
    await waitForBridge();

    // One message posted, then updated in place — no per-step spam.
    expect(slackMocks.postMessage).toHaveBeenCalledTimes(1);
    expect(slackMocks.postMessage.mock.calls[0]?.[0]?.text).toContain("⏳ Bundle install");
    expect(slackMocks.postMessage.mock.calls[0]?.[0]?.text).toContain("▫️ Rails server");
    expect(slackMocks.update).toHaveBeenCalledTimes(1);
    expect(slackMocks.update.mock.calls[0]?.[0]).toMatchObject({ ts: "1710000000.000700" });
    expect(slackMocks.update.mock.calls[0]?.[0]?.text).toContain("✅ Bundle install");
    expect(slackMocks.update.mock.calls[0]?.[0]?.text).toContain("⏳ Rails server");
  });

  it("reports a failed application workflow to the bound thread", async () => {
    slackMocks.postMessage.mockReset();
    slackMocks.postMessage.mockResolvedValue({ ts: "1710000000.000500" });

    slackEventBridge.attachGroup("group-1", {
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000000.000100",
    });

    eventSource.push({
      sessionEvents: {
        eventType: "session_application_workflow_failed",
        payload: { workflow: { lastError: 'Step "Rails server" failed' } },
      } as unknown as PrismaEvent,
    });
    await waitForBridge();

    expect(slackMocks.postMessage).toHaveBeenCalledTimes(1);
    expect(slackMocks.postMessage.mock.calls[0]?.[0]?.text).toContain('Step "Rails server" failed');
  });
});
