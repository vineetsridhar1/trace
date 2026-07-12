import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createThread: vi.fn(),
  postMessage: vi.fn(),
  start: vi.fn(),
  run: vi.fn(),
  attach: vi.fn(),
  attachGroup: vi.fn(),
  buildTraceSessionLink: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    slackThreadSession: { create: mocks.createThread },
  },
}));

vi.mock("../../services/session.js", () => ({
  sessionService: {
    start: mocks.start,
    run: mocks.run,
  },
}));

vi.mock("./client.js", () => ({
  getSlackClient: vi.fn(async () => ({
    chat: {
      postMessage: mocks.postMessage,
      update: vi.fn(),
    },
  })),
}));

vi.mock("./event-bridge.js", () => ({
  buildTraceSessionLink: mocks.buildTraceSessionLink,
  slackEventBridge: {
    attach: mocks.attach,
    attachGroup: mocks.attachGroup,
  },
}));

import { startSlackSession } from "./session-orchestrator.js";

describe("startSlackSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.start.mockResolvedValue({ id: "session-app", sessionGroupId: "group-app" });
    mocks.run.mockResolvedValue({});
    mocks.postMessage.mockResolvedValue({});
    mocks.buildTraceSessionLink.mockResolvedValue("https://trace.test/g/group-app/s/session-app");
  });

  it("starts app builds without a Trace channel and bridges preview events to Slack", async () => {
    await startSlackSession({
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000000.000100",
      organizationId: "org-1",
      actorUserId: "user-1",
      prompt: "build an app for tracking launches",
      settings: {
        tool: null,
        model: null,
        reasoningEffort: null,
        hosting: "cloud",
      },
      source: "mention",
      kind: "app",
    });

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "app",
        channelId: undefined,
        hosting: "cloud",
        prompt: "build an app for tracking launches",
      }),
    );
    expect(mocks.attach).toHaveBeenCalledWith("session-app", {
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000000.000100",
    });
    expect(mocks.attachGroup).toHaveBeenCalledWith("group-app", {
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000000.000100",
    });
    expect(mocks.attachGroup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.run.mock.invocationCallOrder[0]!,
    );
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_ts: "1710000000.000100",
        text: expect.stringContaining("App build started"),
      }),
    );
  });
});
