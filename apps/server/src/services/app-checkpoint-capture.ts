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
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_SIGNATURE = Buffer.from("%PDF-");
const MAX_CONCURRENT_CAPTURES = 2;
let activeCaptures = 0;
const captureWaiters: Array<() => void> = [];

async function withCaptureSlot<T>(operation: () => Promise<T>): Promise<T> {
  // Re-check after every wakeup: a fresh caller can claim the slot freed by a
  // finishing capture before the woken waiter's microtask runs, so an `if`
  // here would over-admit (3 concurrent for MAX=2). The loop re-queues the
  // waiter if the slot was taken; a waiter only blocks while a capture is
  // active, so the freeing capture's release is guaranteed to wake it.
  while (activeCaptures >= MAX_CONCURRENT_CAPTURES) {
    await new Promise<void>((resolve) => captureWaiters.push(resolve));
  }
  activeCaptures += 1;
  try {
    return await operation();
  } finally {
    activeCaptures -= 1;
    captureWaiters.shift()?.();
  }
}

export type AppCheckpointCaptureResult = {
  captureStatus: "captured" | "unavailable" | "failed";
  captureKey?: string;
  captureUrl?: string;
  captureContentType?: string;
  capturedAt?: Date;
};

function captureUrl(
  endpoint: {
    id: string;
    key: string;
    organizationId: string;
    accessMode: string;
  },
  userId: string,
): string {
  const url = new URL(buildEndpointUrl(endpoint.key));
  if (endpoint.accessMode === "public") return url.toString();
  const credential = createEndpointPreviewToken({
    userId,
    organizationId: endpoint.organizationId,
    endpointId: endpoint.id,
  });
  url.pathname = "/__trace_preview_auth";
  url.searchParams.set("token", credential.token);
  url.searchParams.set("next", "/");
  return url.toString();
}

export async function renderEndpointScreenshot(url: string, checkpointId: string): Promise<Buffer> {
  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-app-capture-"));
  const outputPath = path.join(workdir, `${checkpointId}.png`);
  try {
    await execFileAsync(
      process.env.TRACE_CHROMIUM_EXECUTABLE?.trim() || "chromium",
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        `--user-data-dir=${path.join(workdir, "profile")}`,
        "--window-size=1440,900",
        "--virtual-time-budget=3000",
        `--screenshot=${outputPath}`,
        url,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const screenshot = await fs.promises.readFile(outputPath);
    if (
      screenshot.byteLength <= PNG_SIGNATURE.byteLength ||
      !screenshot.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
    ) {
      throw new Error("Chromium did not produce a valid PNG capture");
    }
    return screenshot;
  } finally {
    await fs.promises.rm(workdir, { recursive: true, force: true });
  }
}

export async function renderEndpointPdf(url: string, checkpointId: string): Promise<Buffer> {
  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-pdf-export-"));
  const outputPath = path.join(workdir, `${checkpointId}.pdf`);
  try {
    await execFileAsync(
      process.env.TRACE_CHROMIUM_EXECUTABLE?.trim() || "chromium",
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        `--user-data-dir=${path.join(workdir, "profile")}`,
        "--print-to-pdf-no-header",
        `--print-to-pdf=${outputPath}`,
        url,
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
    const pdf = await fs.promises.readFile(outputPath);
    if (pdf.byteLength <= PDF_SIGNATURE.byteLength || !pdf.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
      throw new Error("Chromium did not produce a valid PDF");
    }
    return pdf;
  } finally {
    await fs.promises.rm(workdir, { recursive: true, force: true });
  }
}

export const appCheckpointCaptureService = {
  async capturePdf(input: {
    organizationId: string;
    sessionGroupId: string;
    checkpointId: string;
    commitSha: string;
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
      select: { id: true, key: true, organizationId: true, accessMode: true },
    });
    if (!endpoint) return { captureStatus: "unavailable" };
    try {
      const pdf = await withCaptureSlot(() =>
        renderEndpointPdf(captureUrl(endpoint, input.userId), input.checkpointId),
      );
      const captureKey = `pdf-exports/${input.organizationId}/${input.sessionGroupId}/${input.commitSha}-${randomUUID()}.pdf`;
      await storage.putObject(captureKey, pdf, "application/pdf");
      return {
        captureStatus: "captured",
        captureKey,
        captureContentType: "application/pdf",
        capturedAt: new Date(),
      };
    } catch (error) {
      console.warn("[pdf-checkpoint] export failed", {
        checkpointId: input.checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { captureStatus: "failed", capturedAt: new Date() };
    }
  },

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
      select: { id: true, key: true, organizationId: true, accessMode: true },
    });
    if (!endpoint) return { captureStatus: "unavailable" };

    try {
      const screenshot = await withCaptureSlot(() =>
        renderEndpointScreenshot(captureUrl(endpoint, input.userId), input.checkpointId),
      );
      const captureKey = `uploads/${input.organizationId}/app-checkpoints/${input.checkpointId}-${randomUUID()}.png`;
      await storage.putObject(captureKey, screenshot, "image/png");
      return {
        captureStatus: "captured",
        captureKey,
        captureUrl: await storage.getGetUrl(captureKey, {
          downloadFilename: `${input.checkpointId}.png`,
        }),
        captureContentType: "image/png",
        capturedAt: new Date(),
      };
    } catch {
      return { captureStatus: "failed", capturedAt: new Date() };
    }
  },
};
