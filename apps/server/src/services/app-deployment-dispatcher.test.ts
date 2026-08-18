import { afterEach, describe, expect, it, vi } from "vitest";
import { LauncherAppDeploymentDispatcher } from "./app-deployment-dispatcher.js";

const input = {
  deploymentId: "deployment-1",
  organizationId: "org-1",
  sessionGroupId: "group-1",
  repoId: "repo-1",
  checkpointId: "a".repeat(40),
  commitSha: "a".repeat(40),
  appSlug: "notes-group1",
  spec: { target: "static" as const, outputDirectory: "dist" },
  callback: {
    url: "https://trace.example.com/internal/app-deployments/deployment-1/status",
    token: "callback-token",
  },
  requestedAt: "2026-08-16T00:00:00.000Z",
};

describe("LauncherAppDeploymentDispatcher", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hands the immutable source capability to the configured launcher", async () => {
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.example.com");
    vi.stubEnv("TRACE_APP_DEPLOYMENT_LAUNCHER_URL", "https://launcher.trace.example.com");
    vi.stubEnv("TRACE_APP_DEPLOYMENT_LAUNCHER_TOKEN", "launcher-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ jobId: "queue-message-1" }), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(new LauncherAppDeploymentDispatcher().enqueue(input)).resolves.toEqual({
      externalJobId: "queue-message-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://launcher.trace.example.com/app-deployments",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer launcher-token",
          "trace-idempotency-key": "deployment-1",
        }),
        body: expect.stringContaining(
          '"sourceUrl":"https://trace.example.com/internal/app-deployments/deployment-1/source"',
        ),
      }),
    );
  });

  it("fails clearly when the launcher is not configured", async () => {
    await expect(new LauncherAppDeploymentDispatcher().enqueue(input)).rejects.toThrow(
      "not configured",
    );
  });
});
