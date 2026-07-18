import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  endpointFindFirst: vi.fn(),
  putObject: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../lib/db.js", () => ({
  prisma: { sessionEndpoint: { findFirst: mocks.endpointFindFirst } },
}));

vi.mock("../lib/storage/index.js", () => ({
  storage: { putObject: mocks.putObject },
}));

vi.mock("./endpoint-preview-auth.js", () => ({
  createEndpointPreviewToken: vi.fn(() => ({ token: "preview-token", expiresAt: new Date() })),
  ENDPOINT_PREVIEW_COOKIE: "__trace_endpoint_preview",
}));

import { designCheckpointPreviewService, designExportRequest } from "./design-checkpoint-preview.js";

describe("design checkpoint previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.endpointFindFirst.mockResolvedValue({
      id: "endpoint-1",
      key: "preview-key",
      organizationId: "org-1",
      accessMode: "private",
    });
    mocks.putObject.mockResolvedValue(undefined);
  });

  it("requests the exact checkpoint commit before storing the preview", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("<!doctype html><title>Saved</title>", {
        headers: { "content-length": "36" },
      }),
    );

    const result = await designCheckpointPreviewService.publish({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      checkpointId: "checkpoint-1",
      commitSha: "a".repeat(40),
      userId: "user-1",
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/__trace_design_export?ref=" + "a".repeat(40)),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          cookie: expect.stringContaining("__trace_endpoint_preview="),
        }),
      }),
    );
    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.stringContaining("design-previews/org-1/group-1/checkpoint-1-"),
      expect.any(Buffer),
      "text/html; charset=utf-8",
    );
    expect(result).toMatchObject({
      previewStatus: "captured",
      previewUrl: expect.stringContaining("/design-previews/checkpoint-1"),
    });
  });

  it("authenticates a private export with a direct preview cookie, not a browser redirect", () => {
    const { url, headers } = designExportRequest(
      { id: "endpoint-1", key: "preview-key", organizationId: "org-1", accessMode: "private" },
      "user-1",
      "b".repeat(40),
    );
    const parsed = new URL(url);

    // Server-side fetch has no cookie jar, so the export must hit the export path
    // directly (no /__trace_preview_auth redirect) and carry the token as a cookie.
    expect(parsed.pathname).toBe("/__trace_design_export");
    expect(parsed.searchParams.get("ref")).toBe("b".repeat(40));
    expect(headers.cookie).toContain("__trace_endpoint_preview=");
  });

  it("omits the preview cookie for a public export", () => {
    const { url, headers } = designExportRequest(
      { id: "endpoint-1", key: "preview-key", organizationId: "org-1", accessMode: "public" },
      "user-1",
      "b".repeat(40),
    );
    const parsed = new URL(url);

    expect(parsed.pathname).toBe("/__trace_design_export");
    expect(parsed.searchParams.get("ref")).toBe("b".repeat(40));
    expect(headers.cookie).toBeUndefined();
  });

  it("stores a managed commit export without requiring a Trace checkpoint", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("<!doctype html><title>Saved</title>", {
        headers: { "content-length": "36" },
      }),
    );

    const result = await designCheckpointPreviewService.publishCommit({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      commitSha: "c".repeat(40),
      userId: "user-1",
    });

    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.stringContaining(`design-previews/org-1/group-1/commit-${"c".repeat(40)}-`),
      expect.any(Buffer),
      "text/html; charset=utf-8",
    );
    expect(result.previewStatus).toBe("captured");
  });

  it("records an unavailable preview when no live design endpoint exists", async () => {
    mocks.endpointFindFirst.mockResolvedValue(null);

    await expect(
      designCheckpointPreviewService.publish({
        organizationId: "org-1",
        sessionGroupId: "group-1",
        checkpointId: "checkpoint-1",
        commitSha: "c".repeat(40),
        userId: "user-1",
      }),
    ).resolves.toEqual({ previewStatus: "unavailable" });
  });
});
