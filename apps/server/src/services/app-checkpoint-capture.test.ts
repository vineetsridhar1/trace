import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    putObject: vi.fn().mockResolvedValue(undefined),
    getGetUrl: vi.fn().mockResolvedValue("https://files.example/checkpoint.png"),
  },
}));

import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { appCheckpointCaptureService, renderEndpointScreenshot } from "./app-checkpoint-capture.js";

const execFileMock = vi.mocked(execFile);
const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const storageMock = storage as unknown as {
  putObject: ReturnType<typeof vi.fn>;
  getGetUrl: ReturnType<typeof vi.fn>;
};
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function callbackFrom(args: unknown[]): ExecCallback {
  for (const arg of args) {
    if (typeof arg === "function") return arg as ExecCallback;
  }
  throw new Error("execFile callback was not provided");
}

function screenshotPathFrom(args: unknown[]): string {
  const commandArgs = args[1];
  if (!Array.isArray(commandArgs)) throw new Error("Chromium args missing");
  const screenshotArg = commandArgs.find(
    (arg): arg is string => typeof arg === "string" && arg.startsWith("--screenshot="),
  );
  if (!screenshotArg) throw new Error("Screenshot output arg missing");
  return screenshotArg.slice("--screenshot=".length);
}

function pathCheckpointId(outputPath: string): string {
  return path.basename(outputPath, ".png");
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

describe("appCheckpointCaptureService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRACE_CHROMIUM_EXECUTABLE", "/usr/bin/chromium");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.test");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME", "https");
  });

  it("renders endpoint screenshots with Chromium", async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      fs.writeFileSync(screenshotPathFrom(args), pngBytes);
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    const screenshot = await renderEndpointScreenshot({
      url: "https://endpoint.preview.test",
      checkpointId: "checkpoint-1",
    });

    expect(screenshot).toEqual(pngBytes);
    expect(execFileMock).toHaveBeenCalledWith(
      "/usr/bin/chromium",
      expect.arrayContaining([
        "--headless=new",
        "--window-size=1440,900",
        expect.stringMatching(/^--screenshot=/),
        "https://endpoint.preview.test",
      ]),
      expect.objectContaining({ timeout: 30_000 }),
      expect.any(Function),
    );
  });

  it("captures the primary enabled endpoint and uploads a PNG", async () => {
    prismaMock.sessionEndpoint.findFirst.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpointkey",
      organizationId: "org-1",
      accessMode: "private",
    });
    execFileMock.mockImplementation((...args: unknown[]) => {
      const commandArgs = args[1];
      if (!Array.isArray(commandArgs)) throw new Error("Chromium args missing");
      expect(commandArgs.at(-1)).toEqual(
        expect.stringContaining("https://endpointkey.preview.test/__trace_preview_auth"),
      );
      fs.writeFileSync(screenshotPathFrom(args), pngBytes);
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    const result = await appCheckpointCaptureService.capture({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      checkpointId: "checkpoint-1",
      userId: "user-1",
    });

    expect(result).toMatchObject({
      captureStatus: "captured",
      captureUrl: "https://files.example/checkpoint.png",
      captureContentType: "image/png",
    });
    expect(storageMock.putObject).toHaveBeenCalledWith(
      expect.stringContaining("uploads/org-1/app-checkpoints/checkpoint-1-"),
      pngBytes,
      "image/png",
    );
  });

  it("rejects non-PNG Chromium captures before upload", async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      fs.writeFileSync(screenshotPathFrom(args), Buffer.from("not an image"));
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    await expect(
      renderEndpointScreenshot({
        url: "https://endpoint.preview.test",
        checkpointId: "checkpoint-1",
      }),
    ).rejects.toThrow("Chromium produced a non-PNG app checkpoint capture");
    expect(storageMock.putObject).not.toHaveBeenCalled();
  });

  it("reserves capture slots for queued checkpoint screenshots", async () => {
    vi.stubEnv("TRACE_APP_CAPTURE_CONCURRENCY", "1");
    vi.stubEnv("TRACE_APP_CAPTURE_QUEUE_SIZE", "4");
    vi.resetModules();
    const { renderEndpointScreenshot: isolatedRenderEndpointScreenshot } = await import(
      "./app-checkpoint-capture.js"
    );
    const started: string[] = [];
    const callbacks: ExecCallback[] = [];

    execFileMock.mockImplementation((...args: unknown[]) => {
      const outputPath = screenshotPathFrom(args);
      started.push(pathCheckpointId(outputPath));
      fs.writeFileSync(outputPath, pngBytes);
      callbacks.push(callbackFrom(args));
      return null as never;
    });

    const first = isolatedRenderEndpointScreenshot({
      url: "https://endpoint.preview.test",
      checkpointId: "checkpoint-1",
    });
    const second = isolatedRenderEndpointScreenshot({
      url: "https://endpoint.preview.test",
      checkpointId: "checkpoint-2",
    });
    const third = isolatedRenderEndpointScreenshot({
      url: "https://endpoint.preview.test",
      checkpointId: "checkpoint-3",
    });

    await waitForAssertion(() => expect(started).toEqual(["checkpoint-1"]));
    callbacks[0](null, "", "");
    await waitForAssertion(() => expect(started).toEqual(["checkpoint-1", "checkpoint-2"]));
    callbacks[1](null, "", "");
    await waitForAssertion(() =>
      expect(started).toEqual(["checkpoint-1", "checkpoint-2", "checkpoint-3"]),
    );
    callbacks[2](null, "", "");

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      pngBytes,
      pngBytes,
      pngBytes,
    ]);
  });

  it("marks capture unavailable when no endpoint is enabled", async () => {
    prismaMock.sessionEndpoint.findFirst.mockResolvedValueOnce(null);

    await expect(
      appCheckpointCaptureService.capture({
        organizationId: "org-1",
        sessionGroupId: "group-1",
        checkpointId: "checkpoint-1",
        userId: "user-1",
      }),
    ).resolves.toEqual({ captureStatus: "unavailable" });
  });
});
