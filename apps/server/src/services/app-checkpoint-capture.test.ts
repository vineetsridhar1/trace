import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  endpointFindFirst: vi.fn(),
  putObject: vi.fn(),
  getGetUrl: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
    mocks.execFile(...args);
    callback(null, "", "");
  },
}));

vi.mock("fs", () => ({
  default: {
    promises: { mkdtemp: mocks.mkdtemp, readFile: mocks.readFile, rm: mocks.rm },
  },
}));

vi.mock("../lib/db.js", () => ({
  prisma: { sessionEndpoint: { findFirst: mocks.endpointFindFirst } },
}));

vi.mock("../lib/storage/index.js", () => ({
  storage: { putObject: mocks.putObject, getGetUrl: mocks.getGetUrl },
}));

vi.mock("./endpoint-preview-auth.js", () => ({
  createEndpointPreviewToken: vi.fn(() => ({ token: "preview-token", expiresAt: new Date() })),
}));

import { appCheckpointCaptureService, renderEndpointScreenshot } from "./app-checkpoint-capture.js";

const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("png-data"),
]);

describe("app checkpoint capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mkdtemp.mockResolvedValue("/tmp/capture");
    mocks.rm.mockResolvedValue(undefined);
    mocks.getGetUrl.mockResolvedValue("https://files.example/capture.png");
  });

  it("rejects corrupt screenshot bytes", async () => {
    mocks.readFile.mockResolvedValue(Buffer.from("not-a-png"));

    await expect(
      renderEndpointScreenshot("https://preview.example", "checkpoint-1"),
    ).rejects.toThrow("valid PNG");
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("uploads a validated PNG for an enabled private endpoint", async () => {
    mocks.endpointFindFirst.mockResolvedValue({
      id: "endpoint-1",
      key: "preview-key",
      organizationId: "org-1",
      accessMode: "private",
    });
    mocks.readFile.mockResolvedValue(validPng);

    const result = await appCheckpointCaptureService.capture({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      checkpointId: "checkpoint-1",
      userId: "user-1",
    });

    expect(result).toMatchObject({
      captureStatus: "captured",
      captureUrl: "https://files.example/capture.png",
      captureContentType: "image/png",
    });
    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.stringContaining("app-checkpoints/checkpoint-1-"),
      validPng,
      "image/png",
    );
  });
});
