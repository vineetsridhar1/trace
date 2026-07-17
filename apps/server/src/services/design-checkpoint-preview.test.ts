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
}));

import { designCheckpointPreviewService, designExportUrl } from "./design-checkpoint-preview.js";

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
      expect.stringContaining(encodeURIComponent("/__trace_design_export?ref=" + "a".repeat(40))),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

  it("encodes the checkpoint ref in the private preview redirect", () => {
    const url = new URL(
      designExportUrl(
        { id: "endpoint-1", key: "preview-key", organizationId: "org-1", accessMode: "private" },
        "user-1",
        "b".repeat(40),
      ),
    );

    expect(url.pathname).toBe("/__trace_preview_auth");
    expect(url.searchParams.get("next")).toBe(`/__trace_design_export?ref=${"b".repeat(40)}`);
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
