import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./api-token.js", () => ({
  apiTokenService: {
    getDecryptedTokens: vi.fn(),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { apiTokenService } from "./api-token.js";
import { eventService } from "./event.js";
import { WebhookService, parseGitHubRepo } from "./webhook.js";

const prismaMock = prisma as any;
const apiTokenServiceMock = apiTokenService as any;
const eventServiceMock = eventService as any;

describe("WebhookService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("parses GitHub repo remotes", () => {
    expect(parseGitHubRepo("https://github.com/acme/trace.git")).toEqual({
      owner: "acme",
      repo: "trace",
    });
    expect(parseGitHubRepo("git@github.com:acme/trace.git")).toEqual({
      owner: "acme",
      repo: "trace",
    });
    expect(parseGitHubRepo("https://example.com/repo.git")).toBeNull();
  });

  it("registers a GitHub webhook and stores the resulting metadata", async () => {
    prismaMock.repo.findUniqueOrThrow.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "trace",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "main",
      webhookId: null,
    });
    apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ github: "gh-token" });
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 123 }),
    });
    prismaMock.repo.update.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "trace",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "main",
      webhookId: "123",
      webhookSecret: "secret",
    });

    const service = new WebhookService();
    const repo = await service.registerGitHubWebhook("repo-1", "user-1", "org-1");

    expect(repo.webhookId).toBe("123");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/trace/hooks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gh-token",
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalled();
  });

  it("validates org ownership and token availability before registering", async () => {
    prismaMock.repo.findUniqueOrThrow.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-2",
      remoteUrl: "https://github.com/acme/trace.git",
      webhookId: null,
    });

    const service = new WebhookService();
    await expect(service.registerGitHubWebhook("repo-1", "user-1", "org-1")).rejects.toThrow(
      "Repo does not belong to the current organization",
    );

    prismaMock.repo.findUniqueOrThrow.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      remoteUrl: "https://github.com/acme/trace.git",
      webhookId: null,
    });
    apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({});

    await expect(service.registerGitHubWebhook("repo-1", "user-1", "org-1")).rejects.toThrow(
      "No GitHub token configured. Please add a GitHub API token first.",
    );
  });

  it("unregisters webhooks and tolerates missing GitHub-side hooks", async () => {
    prismaMock.repo.findUniqueOrThrow.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "trace",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "main",
      webhookId: "123",
    });
    apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({ github: "gh-token" });
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "missing",
    });
    prismaMock.repo.update.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      webhookId: null,
      webhookSecret: null,
      name: "trace",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "main",
    });

    const service = new WebhookService();
    const repo = await service.unregisterGitHubWebhook("repo-1", "user-1", "org-1");

    expect(repo.webhookId).toBeNull();
    expect(prismaMock.repo.update).toHaveBeenCalledWith({
      where: { id: "repo-1" },
      data: {
        webhookId: null,
        webhookSecret: null,
      },
    });
  });
});
