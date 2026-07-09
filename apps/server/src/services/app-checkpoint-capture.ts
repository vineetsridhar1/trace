import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { createEndpointPreviewToken } from "./endpoint-preview-auth.js";
import { buildEndpointUrl } from "./endpoint-utils.js";

const execFileAsync = promisify(execFile);
const DEFAULT_CAPTURE_TIMEOUT_MS = 30_000;
const DEFAULT_CAPTURE_WIDTH = 1440;
const DEFAULT_CAPTURE_HEIGHT = 900;

export type AppCheckpointCaptureResult = {
  captureStatus: "captured" | "unavailable" | "failed";
  captureKey?: string;
  captureUrl?: string;
  captureContentType?: string;
  capturedAt?: Date;
};

function chromiumExecutable(): string {
  return (
    process.env.TRACE_CHROMIUM_EXECUTABLE?.trim() ||
    process.env.CHROMIUM_EXECUTABLE_PATH?.trim() ||
    "chromium"
  );
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function screenshotArgs(input: {
  url: string;
  outputPath: string;
  userDataDir: string;
  width: number;
  height: number;
}): string[] {
  return [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${input.userDataDir}`,
    `--window-size=${input.width},${input.height}`,
    "--virtual-time-budget=3000",
    `--screenshot=${input.outputPath}`,
    input.url,
  ];
}

function endpointCaptureUrl(input: {
  endpoint: {
    id: string;
    key: string;
    organizationId: string;
    accessMode: string;
  };
  userId: string;
}) {
  const url = new URL(buildEndpointUrl(input.endpoint.key));
  if (input.endpoint.accessMode === "public") return url.toString();

  const credential = createEndpointPreviewToken({
    userId: input.userId,
    organizationId: input.endpoint.organizationId,
    endpointId: input.endpoint.id,
  });
  url.pathname = "/__trace_preview_auth";
  url.searchParams.set("token", credential.token);
  url.searchParams.set("next", "/");
  return url.toString();
}

export async function renderEndpointScreenshot(input: {
  url: string;
  checkpointId: string;
}): Promise<Buffer> {
  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-app-capture-"));
  const outputPath = path.join(workdir, `${input.checkpointId}.png`);
  const userDataDir = path.join(workdir, "profile");

  try {
    await execFileAsync(
      chromiumExecutable(),
      screenshotArgs({
        url: input.url,
        outputPath,
        userDataDir,
        width: readPositiveInt(process.env.TRACE_APP_CAPTURE_WIDTH, DEFAULT_CAPTURE_WIDTH),
        height: readPositiveInt(process.env.TRACE_APP_CAPTURE_HEIGHT, DEFAULT_CAPTURE_HEIGHT),
      }),
      {
        timeout: readPositiveInt(
          process.env.TRACE_APP_CAPTURE_TIMEOUT_MS,
          DEFAULT_CAPTURE_TIMEOUT_MS,
        ),
        maxBuffer: 1024 * 1024,
      },
    );
    const screenshot = await fs.promises.readFile(outputPath);
    if (screenshot.byteLength === 0) {
      throw new Error("Chromium produced an empty app checkpoint capture");
    }
    return screenshot;
  } finally {
    await fs.promises.rm(workdir, { recursive: true, force: true });
  }
}

export const appCheckpointCaptureService = {
  async capture(input: {
    organizationId: string;
    sessionGroupId: string;
    checkpointId: string;
    userId: string;
  }): Promise<AppCheckpointCaptureResult> {
    const endpoint = await prisma.sessionEndpoint.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionGroupId: input.sessionGroupId,
        status: "enabled",
        revokedAt: null,
        protocol: "http",
      },
      orderBy: [{ enabledAt: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        key: true,
        organizationId: true,
        accessMode: true,
      },
    });
    if (!endpoint) return { captureStatus: "unavailable" };

    try {
      const screenshot = await renderEndpointScreenshot({
        url: endpointCaptureUrl({ endpoint, userId: input.userId }),
        checkpointId: input.checkpointId,
      });
      const captureKey = `uploads/${input.organizationId}/app-checkpoints/${input.checkpointId}-${randomUUID()}.png`;
      await storage.putObject(captureKey, screenshot, "image/png");
      const captureUrl = await storage.getGetUrl(captureKey, {
        downloadFilename: `${input.checkpointId}.png`,
      });
      return {
        captureStatus: "captured",
        captureKey,
        captureUrl,
        captureContentType: "image/png",
        capturedAt: new Date(),
      };
    } catch {
      return { captureStatus: "failed", capturedAt: new Date() };
    }
  },
};
