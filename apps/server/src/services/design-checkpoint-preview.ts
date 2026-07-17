import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { createEndpointPreviewToken } from "./endpoint-preview-auth.js";
import { buildEndpointUrl } from "./endpoint-utils.js";

const MAX_EXPORT_BYTES = 15 * 1024 * 1024;

export type DesignCheckpointPreviewResult = {
  previewStatus: "captured" | "unavailable" | "failed";
  previewKey?: string;
  previewUrl?: string;
  previewContentType?: string;
  previewCapturedAt?: Date;
};

function designExportUrl(
  endpoint: { id: string; key: string; organizationId: string; accessMode: string },
  userId: string,
): string {
  const url = new URL(buildEndpointUrl(endpoint.key));
  if (endpoint.accessMode === "public") {
    url.pathname = "/__trace_design_export";
    return url.toString();
  }
  const credential = createEndpointPreviewToken({
    userId,
    organizationId: endpoint.organizationId,
    endpointId: endpoint.id,
  });
  url.pathname = "/__trace_preview_auth";
  url.searchParams.set("token", credential.token);
  url.searchParams.set("next", "/__trace_design_export");
  return url.toString();
}

export const designCheckpointPreviewService = {
  async publish(input: {
    organizationId: string;
    sessionGroupId: string;
    checkpointId: string;
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
      const response = await fetch(designExportUrl(endpoint, input.userId));
      if (!response.ok) throw new Error(`Design export returned ${response.status}`);
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > MAX_EXPORT_BYTES) throw new Error("Design export exceeds size limit");
      const html = Buffer.from(await response.arrayBuffer());
      if (html.byteLength === 0 || html.byteLength > MAX_EXPORT_BYTES) {
        throw new Error("Design export has an invalid size");
      }
      const previewKey = `design-previews/${input.organizationId}/${input.sessionGroupId}/${input.checkpointId}-${randomUUID()}.html`;
      await storage.putObject(previewKey, html, "text/html; charset=utf-8");
      return {
        previewStatus: "captured",
        previewKey,
        previewUrl: await storage.getGetUrl(previewKey),
        previewContentType: "text/html",
        previewCapturedAt: new Date(),
      };
    } catch {
      return { previewStatus: "failed", previewCapturedAt: new Date() };
    }
  },
};
