import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { createEndpointPreviewToken, ENDPOINT_PREVIEW_COOKIE } from "./endpoint-preview-auth.js";
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

export function designExportRequest(
  endpoint: { id: string; key: string; organizationId: string; accessMode: string },
  userId: string,
  commitSha: string,
): { url: string; headers: Record<string, string> } {
  const url = new URL(buildEndpointUrl(endpoint.key));
  url.pathname = "/__trace_design_export";
  url.searchParams.set("ref", commitSha);
  if (endpoint.accessMode === "public") {
    return { url: url.toString(), headers: {} };
  }
  // A private endpoint gates on the endpoint-preview cookie. This capture is a
  // server-side fetch with no cookie jar, so the browser preview-auth flow
  // (Set-Cookie on /__trace_preview_auth → 302 → export) drops the cookie across
  // the redirect and the proxy answers 403. Send the preview token directly as
  // the cookie the proxy reads, hitting the export path without a redirect.
  const credential = createEndpointPreviewToken({
    userId,
    organizationId: endpoint.organizationId,
    endpointId: endpoint.id,
  });
  return {
    url: url.toString(),
    headers: { cookie: `${ENDPOINT_PREVIEW_COOKIE}=${encodeURIComponent(credential.token)}` },
  };
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

async function fetchExport(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers });
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
        const { url, headers } = designExportRequest(endpoint, input.userId, input.commitSha);
        const response = await fetchExport(url, headers);
        if (!response.ok) {
          // The design-starter returns the real reason (e.g. a git rev-parse
          // miss, a design-QA failure, or a vite build error) only in the body.
          // Surface it — discarding it here is why export failures were opaque.
          const detail = (await response.text().catch(() => ""))
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500);
          throw new Error(
            `Design export returned ${response.status}${detail ? `: ${detail}` : ""}`,
          );
        }
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
