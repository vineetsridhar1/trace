import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context.js";

vi.mock("../services/service-access-token.js", () => ({
  serviceAccessTokenService: {
    create: vi.fn(),
    list: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock("../services/session.js", () => ({
  sessionService: {
    getServiceStatus: vi.fn(),
    startService: vi.fn(),
  },
}));

import { serviceAccessTokenService } from "../services/service-access-token.js";
import { sessionService } from "../services/session.js";
import { serviceAccessTokenMutations, serviceAccessTokenQueries } from "./service-access-token.js";

const tokenServiceMock = serviceAccessTokenService as unknown as {
  create: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
};
const sessionServiceMock = sessionService as unknown as {
  getServiceStatus: ReturnType<typeof vi.fn>;
  startService: ReturnType<typeof vi.fn>;
};

function context(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    organizationId: "org-1",
    clientSource: "deployment-daemon",
    role: "admin",
    authKind: "service",
    serviceAccessTokenId: "service-token-1",
    serviceApiScopes: ["sessions_start", "sessions_status_read"],
    actorType: "agent",
    ...overrides,
  } as Context;
}

describe("service access token resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pins status reads to the authenticated service organization", async () => {
    sessionServiceMock.getServiceStatus.mockResolvedValueOnce({ id: "session-1" });

    await expect(
      serviceAccessTokenQueries.serviceSessionStatus({}, { id: "session-1" }, context()),
    ).resolves.toEqual({ id: "session-1" });
    expect(sessionServiceMock.getServiceStatus).toHaveBeenCalledWith("session-1", "org-1");
  });

  it("maps only supported start fields and injects trusted service identity", async () => {
    sessionServiceMock.startService.mockResolvedValueOnce({ id: "session-1" });

    await serviceAccessTokenMutations.startServiceSession(
      {},
      {
        input: {
          idempotencyKey: "request-1",
          tool: "codex",
          model: "gpt-5",
          reasoningEffort: "high",
          repoId: "repo-1",
          branch: "feature",
          ticketId: "ticket-1",
          channelId: "channel-1",
          projectId: "project-1",
          prompt: "Run the task",
          interactionMode: "default",
        },
      },
      context(),
    );

    expect(sessionServiceMock.startService).toHaveBeenCalledWith({
      idempotencyKey: "request-1",
      tool: "codex",
      model: "gpt-5",
      reasoningEffort: "high",
      repoId: "repo-1",
      branch: "feature",
      ticketId: "ticket-1",
      channelId: "channel-1",
      projectId: "project-1",
      prompt: "Run the task",
      interactionMode: "default",
      organizationId: "org-1",
      createdById: "user-1",
      serviceAccessTokenId: "service-token-1",
      clientSource: "deployment-daemon",
    });
  });

  it("rejects service-only operations from a regular session context", async () => {
    await expect(
      serviceAccessTokenMutations.startServiceSession(
        {},
        { input: { idempotencyKey: "request-1", prompt: "Run" } },
        context({ authKind: "session", serviceAccessTokenId: null }),
      ),
    ).rejects.toThrow("Service token required");
    expect(sessionServiceMock.startService).not.toHaveBeenCalled();
  });

  it("passes human management identity to the admin-enforcing token service", async () => {
    tokenServiceMock.list.mockResolvedValueOnce([]);
    const adminContext = context({
      authKind: "session",
      serviceAccessTokenId: null,
      serviceApiScopes: [],
      actorType: "user",
    });

    await serviceAccessTokenQueries.serviceAccessTokens(
      {},
      { organizationId: "org-2" },
      adminContext,
    );
    expect(tokenServiceMock.list).toHaveBeenCalledWith({
      organizationId: "org-2",
      actorType: "user",
      actorId: "user-1",
    });
  });
});
