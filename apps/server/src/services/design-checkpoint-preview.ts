import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { createEndpointPreviewToken } from "./endpoint-preview-auth.js";
import { buildEndpointUrl } from "./endpoint-utils.js";
import { designCheckpointPreviewUrl } from "../lib/design-checkpoint-preview-url.js";

const MAX_EXPORT_BYTES = 15 * 1024 * 1024;
const EXPORT_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_EXPORTS = 2;
let activeExports = 0;
const exportWaiters: Array<() => void> = [];

export type DesignCheckpointPreviewResult = {
  previewStatus: "captured" | "unavailable" | "failed";
  previewKey?: string;
  previewUrl?: string;
  previewContentType?: string;
  previewCapturedAt?: Date;
};

export function designExportUrl(
  endpoint: { id: string; key: string; organizationId: string; accessMode: string },
  userId: string,
  commitSha: string,
): string {
  const url = new URL(buildEndpointUrl(endpoint.key));
  if (endpoint.accessMode === "public") {
    url.pathname = "/__trace_design_export";
    url.searchParams.set("ref", commitSha);
    return url.toString();
  }
  const credential = createEndpointPreviewToken({
    userId,
    organizationId: endpoint.organizationId,
    endpointId: endpoint.id,
  });
  url.pathname = "/__trace_preview_auth";
  url.searchParams.set("token", credential.token);
  url.searchParams.set("next", `/__trace_design_export?ref=${encodeURIComponent(commitSha)}`);
  return url.toString();
}

async function withExportSlot<T>(operation: () => Promise<T>): Promise<T> {
  while (activeExports >= MAX_CONCURRENT_EXPORTS) {
    await new Promise<void>((resolve) => exportWaiters.push(resolve));
  }
  activeExports += 1;
  try {
    return await operation();
  } finally {
    activeExports -= 1;
    exportWaiters.shift()?.();
  }
}

async function fetchExport(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export const designCheckpointPreviewService = {
  async publish(input: {
    organizationId: string;
    sessionGroupId: string;
    checkpointId: string;
    commitSha: string;
    userId: string;
  }): Promise<DesignCheckpointPreviewResult> {
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
    if (!endpoint) return { previewStatus: "unavailable" };
    try {
      const { previewKey } = await withExportSlot(async () => {
        const response = await fetchExport(
          designExportUrl(endpoint, input.userId, input.commitSha),
        );
        if (!response.ok) throw new Error(`Design export returned ${response.status}`);
        const length = Number(response.headers.get("content-length") ?? "0");
        if (length > MAX_EXPORT_BYTES) throw new Error("Design export exceeds size limit");
        const html = Buffer.from(await response.arrayBuffer());
        if (html.byteLength === 0 || html.byteLength > MAX_EXPORT_BYTES) {
          throw new Error("Design export has an invalid size");
        }
        const previewKey = `design-previews/${input.organizationId}/${input.sessionGroupId}/${input.checkpointId}-${randomUUID()}.html`;
        await storage.putObject(previewKey, html, "text/html; charset=utf-8");
        return { previewKey };
      });
      return {
        previewStatus: "captured",
        previewKey,
        previewUrl: designCheckpointPreviewUrl(input.checkpointId),
        previewContentType: "text/html",
        previewCapturedAt: new Date(),
      };
    } catch (error) {
      console.warn("[design-checkpoint] preview export failed", {
        checkpointId: input.checkpointId,
        sessionGroupId: input.sessionGroupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { previewStatus: "failed", previewCapturedAt: new Date() };
    }
  },

  async publishCommit(input: {
    organizationId: string;
    sessionGroupId: string;
    commitSha: string;
    userId: string;
  }): Promise<DesignCheckpointPreviewResult> {
    return this.publish({
      ...input,
      // The object key is intentionally commit-addressed. Unlike a Trace
      // checkpoint, this is only an S3 artifact identifier for a pushed ref.
      checkpointId: `commit-${input.commitSha}`,
    });
  },
};
