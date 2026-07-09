import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { managedGitService } from "./managed-git.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventServiceMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };

describe("managedGitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.example");
    vi.spyOn(managedGitService, "prepareBareRepo").mockResolvedValue("/tmp/repo.git");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("creates app repos with a starter application config", async () => {
    prismaMock.repo.create.mockResolvedValueOnce({ id: "repo-1" });

    const repo = await managedGitService.createAppRepo({
      organizationId: "org-1",
      name: "Customer Portal",
    });

    expect(repo.name).toBe("Customer Portal");
    expect(repo.remoteUrl).toMatch(/^https:\/\/trace\.example\/git\/org-1\/.+\.git$/);
    expect(prismaMock.repo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        name: "Customer Portal",
        provider: "managed",
        defaultBranch: "main",
        setupConfig: expect.objectContaining({
          appStarter: expect.objectContaining({
            framework: "nextjs",
            packageManager: "pnpm",
          }),
          applications: expect.objectContaining({
            setupScripts: expect.arrayContaining([
              expect.objectContaining({ id: "install", command: "pnpm install" }),
              expect.objectContaining({ id: "build", command: "pnpm build" }),
            ]),
            applications: expect.arrayContaining([
              expect.objectContaining({
                id: "web",
                processes: expect.arrayContaining([
                  expect.objectContaining({
                    id: "dev",
                    command: "pnpm dev --hostname 0.0.0.0",
                    ports: expect.arrayContaining([
                      expect.objectContaining({
                        port: 3000,
                        defaultForwardingEnabled: true,
                      }),
                    ]),
                  }),
                ]),
              }),
            ]),
          }),
        }),
      }),
    });
  });

  it("records managed repo push events with branch heads", async () => {
    await managedGitService.recordManagedRepoPush({
      organizationId: "org-1",
      repoId: "repo-1",
      sessionId: "session-1",
      heads: [
        {
          ref: "refs/heads/main",
          branch: "main",
          commitSha: "0123456789abcdef0123456789abcdef01234567",
        },
      ],
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "repo-1",
      eventType: "repo_branch_pushed",
      payload: {
        repoId: "repo-1",
        sessionId: "session-1",
        heads: [
          {
            ref: "refs/heads/main",
            branch: "main",
            commitSha: "0123456789abcdef0123456789abcdef01234567",
          },
        ],
      },
      actorType: "system",
      actorId: "managed-git",
    });
  });
});
