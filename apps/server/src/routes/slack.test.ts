import { createHmac } from "crypto";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const slackMocks = vi.hoisted(() => ({
  postEphemeral: vi.fn(),
  postMessage: vi.fn(),
  replies: vi.fn(),
  update: vi.fn(),
  viewsOpen: vi.fn(),
}));

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  const base = createPrismaMock();
  return {
    prisma: {
      ...base,
      slackInstall: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      slackAccount: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      slackChannelBinding: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      slackSessionDraft: {
        create: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      slackThreadSession: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      slackProcessedEvent: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});

vi.mock("../lib/slack/client.js", () => ({
  getSlackBotToken: vi.fn(),
  getSlackClient: vi.fn(async () => ({
    chat: {
      postEphemeral: slackMocks.postEphemeral,
      postMessage: slackMocks.postMessage,
      update: slackMocks.update,
    },
    conversations: {
      replies: slackMocks.replies,
    },
    views: {
      open: slackMocks.viewsOpen,
    },
  })),
  invalidateSlackClient: vi.fn(),
}));

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    putObject: vi.fn(),
    getGetUrl: vi.fn(),
  },
}));

vi.mock("../lib/slack/session-orchestrator.js", () => ({
  startSlackSession: vi.fn(),
}));

vi.mock("../services/session.js", () => ({
  sessionService: {
    updateDefaults: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock("../services/runtime-access.js", () => ({
  runtimeAccessService: {
    getAccessState: vi.fn(),
    listAccessibleRuntimeInstanceIds: vi.fn(async () => new Set<string>()),
    requestAccess: vi.fn(),
    approveRequest: vi.fn(),
  },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    listRuntimes: vi.fn(() => []),
  },
}));

vi.mock("../lib/slack/event-bridge.js", () => ({
  buildTraceSessionLink: vi.fn(async () => null),
  slackEventBridge: {
    attach: vi.fn(),
    attachGroup: vi.fn(),
    detachGroup: vi.fn(),
  },
}));

vi.mock("../services/session-applications.js", () => ({
  sessionApplicationService: {
    listApplications: vi.fn(),
  },
}));

vi.mock("../services/session-application-workflow.js", () => ({
  sessionApplicationWorkflowService: {
    startWorkflow: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionService } from "../services/session.js";
import { sessionApplicationService } from "../services/session-applications.js";
import { sessionApplicationWorkflowService } from "../services/session-application-workflow.js";
import { slackEventBridge } from "../lib/slack/event-bridge.js";
import { startSlackSession } from "../lib/slack/session-orchestrator.js";
import { slackRouter } from "./slack.js";

type BasePrismaMock = ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
type PrismaMock = BasePrismaMock & {
  slackInstall: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  slackAccount: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  slackChannelBinding: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  slackSessionDraft: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  slackThreadSession: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  slackProcessedEvent: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

const prismaMock = prisma as unknown as PrismaMock;
const sessionServiceMock = sessionService as unknown as {
  sendMessage: ReturnType<typeof vi.fn>;
};
const applicationServiceMock = sessionApplicationService as unknown as {
  listApplications: ReturnType<typeof vi.fn>;
};
const workflowServiceMock = sessionApplicationWorkflowService as unknown as {
  startWorkflow: ReturnType<typeof vi.fn>;
};
const eventBridgeMock = slackEventBridge as unknown as {
  attachGroup: ReturnType<typeof vi.fn>;
};
const startSlackSessionMock = startSlackSession as unknown as ReturnType<typeof vi.fn>;
const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const SLACK_SIGNING_SECRET = "test-slack-signing-secret";

function signedSlackHeaders(rawBody: string): HeadersInit {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature =
    "v0=" +
    createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex");
  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": signature,
  };
}

async function waitForDeferredSlackWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("Slack routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv("SLACK_CLIENT_ID", "client-id");
    vi.stubEnv("SLACK_CLIENT_SECRET", "client-secret");
    vi.stubEnv("SLACK_SIGNING_SECRET", SLACK_SIGNING_SECRET);
    vi.stubEnv("SLACK_REDIRECT_URI", "https://trace.test/slack/oauth/callback");

    slackMocks.postEphemeral.mockResolvedValue({});
    slackMocks.postMessage.mockResolvedValue({});
    slackMocks.replies.mockResolvedValue({ messages: [] });
    slackMocks.update.mockResolvedValue({});
    slackMocks.viewsOpen.mockResolvedValue({});

    const app = express();
    app.use(cookieParser());
    app.use("/slack", slackRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("does not open the advanced start modal for linked Slack users outside the org", async () => {
    prismaMock.slackAccount.findUnique.mockResolvedValue({ userId: "user-outside" });
    prismaMock.slackChannelBinding.findUnique.mockResolvedValue({
      traceChannelId: "channel-1",
      organizationId: "org-1",
    });
    prismaMock.slackInstall.findUnique.mockResolvedValue({ organizationId: "org-1" });
    prismaMock.orgMember.findUnique.mockResolvedValue(null);

    const rawBody = new URLSearchParams({
      team_id: "T1",
      channel_id: "C1",
      user_id: "U1",
      trigger_id: "TRIGGER1",
      text: "start",
    }).toString();

    const response = await fetch(`${baseUrl}/slack/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...signedSlackHeaders(rawBody),
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    await waitForDeferredSlackWork();
    expect(slackMocks.viewsOpen).not.toHaveBeenCalled();
    expect(slackMocks.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        user: "U1",
        text: expect.stringContaining("member of the connected Trace org"),
      }),
    );
  });

  it("does not create mention drafts for linked Slack users outside the org", async () => {
    prismaMock.slackProcessedEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.slackProcessedEvent.create.mockResolvedValue({});
    prismaMock.slackInstall.findUnique.mockResolvedValue({
      organizationId: "org-1",
      botUserId: "BTRACE",
    });
    prismaMock.slackThreadSession.findUnique.mockResolvedValue(null);
    prismaMock.slackAccount.findUnique.mockResolvedValue({ userId: "user-outside" });
    prismaMock.orgMember.findUnique.mockResolvedValue(null);

    const rawBody = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: "E1",
      event: {
        type: "app_mention",
        user: "U1",
        channel: "C1",
        ts: "1710000000.000100",
        text: "<@BTRACE> summarize the roadmap",
      },
    });

    const response = await fetch(`${baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedSlackHeaders(rawBody),
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    await waitForDeferredSlackWork();
    expect(prismaMock.slackSessionDraft.create).not.toHaveBeenCalled();
    expect(slackMocks.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        user: "U1",
        thread_ts: "1710000000.000100",
        text: expect.stringContaining("not in the connected Trace org"),
      }),
    );
  });

  it("includes prior Slack thread messages in new Trace session drafts from reply mentions", async () => {
    prismaMock.slackProcessedEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.slackProcessedEvent.create.mockResolvedValue({});
    prismaMock.slackInstall.findUnique.mockResolvedValue({
      organizationId: "org-1",
      botUserId: "BTRACE",
    });
    prismaMock.slackThreadSession.findUnique.mockResolvedValue(null);
    prismaMock.slackAccount.findUnique.mockResolvedValue({ userId: "user-1" });
    prismaMock.orgMember.findUnique.mockResolvedValue({ userId: "user-1" });
    prismaMock.slackChannelBinding.findUnique.mockResolvedValue({
      traceChannelId: "channel-1",
      organizationId: "org-1",
    });
    prismaMock.slackSessionDraft.create.mockResolvedValue({ id: "draft-1" });
    prismaMock.slackSessionDraft.findUnique.mockResolvedValue({
      id: "draft-1",
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000200.000100",
      slackUserId: "U1",
      organizationId: "org-1",
      traceChannelId: "channel-1",
      prompt: "draft prompt",
      fileRefs: [],
    });
    prismaMock.user.findUnique.mockResolvedValue({
      defaultSessionTool: "claude_code",
      defaultSessionModel: null,
      defaultSessionReasoningEffort: null,
    });
    prismaMock.agentEnvironment.findMany.mockResolvedValue([
      { id: "env-1", name: "Cloud", isDefault: true },
    ]);
    slackMocks.replies.mockResolvedValue({
      messages: [
        {
          user: "UOBS",
          ts: "1710000200.000100",
          text: "Alert: checkout-api error rate is 35%",
        },
        {
          user: "U2",
          ts: "1710000201.000100",
          text: "Looks related to deploy abc123",
        },
        {
          user: "U1",
          ts: "1710000202.000100",
          text: "<@BTRACE>",
        },
      ],
    });

    const rawBody = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: "E3",
      event: {
        type: "app_mention",
        user: "U1",
        channel: "C1",
        channel_type: "channel",
        ts: "1710000202.000100",
        thread_ts: "1710000200.000100",
        text: "<@BTRACE>",
      },
    });

    const response = await fetch(`${baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedSlackHeaders(rawBody),
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    await waitForDeferredSlackWork();
    expect(slackMocks.replies).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        ts: "1710000200.000100",
      }),
    );
    expect(prismaMock.slackSessionDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prompt: expect.stringContaining("Slack thread context before this @trace mention"),
        }),
      }),
    );
    const createCall = prismaMock.slackSessionDraft.create.mock.calls[0]?.[0];
    const prompt =
      typeof createCall?.data?.prompt === "string" ? createCall.data.prompt : "";
    expect(prompt).toContain("<@UOBS>: Alert: checkout-api error rate is 35%");
    expect(prompt).toContain("<@U2>: Looks related to deploy abc123");
    expect(prompt).toContain("Use the Slack thread context above to investigate and fix the issue.");
    expect(slackMocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        thread_ts: "1710000200.000100",
        text: "Start Trace session",
      }),
    );
  });

  it.each([
    ["build an app for tracking launches", "EAPP1", "1710000300.000100"],
    ["Build an application that plans team lunches", "EAPP2", "1710000301.000100"],
  ])("starts an app session directly for %s", async (prompt, eventId, ts) => {
    prismaMock.slackProcessedEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.slackProcessedEvent.create.mockResolvedValue({});
    prismaMock.slackInstall.findUnique.mockResolvedValue({
      organizationId: "org-1",
      botUserId: "BTRACE",
    });
    prismaMock.slackThreadSession.findUnique.mockResolvedValue(null);
    prismaMock.slackAccount.findUnique.mockResolvedValue({ userId: "user-1" });
    prismaMock.orgMember.findUnique.mockResolvedValue({ userId: "user-1" });
    prismaMock.slackChannelBinding.findUnique.mockResolvedValue({
      traceChannelId: "channel-1",
      organizationId: "org-1",
    });
    prismaMock.slackSessionDraft.create.mockResolvedValue({ id: "draft-app" });
    prismaMock.slackSessionDraft.findUnique.mockResolvedValue({
      id: "draft-app",
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: ts,
      slackUserId: "U1",
      organizationId: "org-1",
      traceChannelId: "channel-1",
      prompt,
      fileRefs: [],
    });
    prismaMock.slackSessionDraft.delete.mockResolvedValue({});
    startSlackSessionMock.mockResolvedValue({
      sessionId: "session-app",
      slackThreadTs: ts,
    });

    const rawBody = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: eventId,
      event: {
        type: "app_mention",
        user: "U1",
        channel: "C1",
        channel_type: "channel",
        ts,
        text: `<@BTRACE> ${prompt}`,
      },
    });

    const response = await fetch(`${baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedSlackHeaders(rawBody),
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    await waitForDeferredSlackWork();
    expect(startSlackSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "app",
        prompt,
        traceChannelId: undefined,
        settings: {
          tool: null,
          model: null,
          reasoningEffort: null,
          hosting: "cloud",
        },
      }),
    );
    expect(slackMocks.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: "Start Trace session" }),
    );
  });

  it("posts a thread notice instead of sending Slack replies to deleted worktrees", async () => {
    prismaMock.slackProcessedEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.slackProcessedEvent.create.mockResolvedValue({});
    prismaMock.slackInstall.findUnique.mockResolvedValue({ botUserId: "BTRACE" });
    prismaMock.slackThreadSession.findUnique.mockResolvedValue({
      sessionId: "session-1",
      organizationId: "org-1",
      session: {
        hosting: "cloud",
        sessionGroupId: "group-1",
        connection: {},
        worktreeDeleted: true,
        sessionGroup: null,
      },
    });
    prismaMock.slackAccount.findUnique.mockResolvedValue({ userId: "user-1" });
    prismaMock.orgMember.findUnique.mockResolvedValue({ userId: "user-1" });

    const rawBody = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: "E2",
      event: {
        type: "message",
        user: "U1",
        channel: "C1",
        channel_type: "channel",
        ts: "1710000001.000100",
        thread_ts: "1710000000.000100",
        text: "<@BTRACE> can you keep going?",
      },
    });

    const response = await fetch(`${baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedSlackHeaders(rawBody),
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    await waitForDeferredSlackWork();
    expect(sessionServiceMock.sendMessage).not.toHaveBeenCalled();
    expect(slackMocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        thread_ts: "1710000000.000100",
        text: expect.stringContaining("worktree has been deleted"),
      }),
    );
  });

  it("starts the application workflow when @trace run is used in a bound thread", async () => {
    prismaMock.slackProcessedEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.slackProcessedEvent.create.mockResolvedValue({});
    prismaMock.slackInstall.findUnique.mockResolvedValue({
      organizationId: "org-1",
      botUserId: "BTRACE",
    });
    prismaMock.slackThreadSession.findUnique.mockResolvedValue({
      id: "thread-1",
      sessionId: "session-1",
      session: { worktreeDeleted: false, sessionGroupId: "group-1" },
    });
    prismaMock.slackAccount.findUnique.mockResolvedValue({ userId: "user-1" });
    prismaMock.orgMember.findUnique.mockResolvedValue({ userId: "user-1" });
    applicationServiceMock.listApplications.mockResolvedValue([
      { id: "mortgages", name: "Mortgages" },
    ]);
    workflowServiceMock.startWorkflow.mockResolvedValue({ id: "run-1" });

    const rawBody = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: "E5",
      event: {
        type: "app_mention",
        user: "U1",
        channel: "C1",
        channel_type: "channel",
        ts: "1710000500.000200",
        thread_ts: "1710000500.000100",
        text: "<@BTRACE> run all",
      },
    });

    const response = await fetch(`${baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedSlackHeaders(rawBody),
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    await waitForDeferredSlackWork();
    expect(workflowServiceMock.startWorkflow).toHaveBeenCalledWith(
      "group-1",
      "mortgages",
      "org-1",
      "user-1",
    );
    expect(eventBridgeMock.attachGroup).toHaveBeenCalledWith("group-1", {
      slackTeamId: "T1",
      slackChannelId: "C1",
      slackThreadTs: "1710000500.000100",
    });
    expect(slackMocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        thread_ts: "1710000500.000100",
        text: expect.stringContaining("Starting *Mortgages*"),
      }),
    );
  });

  it("requires current org admin rights before completing Slack OAuth", async () => {
    const realFetch = globalThis.fetch;
    const slackFetchMock = vi.fn();
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return slackFetchMock(input, init);
    }) satisfies typeof fetch);
    prismaMock.orgMember.findUnique.mockResolvedValue({ role: "member" });
    const state = jwt.sign(
      {
        organizationId: "org-1",
        userId: "user-1",
        tokenType: "slack_install",
      },
      JWT_SECRET,
      { expiresIn: "10m" },
    );

    const response = await fetch(
      `${baseUrl}/slack/oauth/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
    );

    expect(response.status).toBe(403);
    expect(slackFetchMock).not.toHaveBeenCalled();
  });
});
