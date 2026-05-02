import { createHash, randomUUID } from "crypto";

export type PreviewVisibilityValue = "org" | "public";

export interface PreviewGatewayAdapter {
  createRoute(input: {
    organizationId: string;
    sessionId: string;
    runtimeInstanceId: string;
    port: number;
    visibility: PreviewVisibilityValue;
  }): Promise<{ routeId: string; url: string }>;

  revokeRoute(routeId: string): Promise<void>;
}

class DevPreviewGatewayAdapter implements PreviewGatewayAdapter {
  async createRoute(input: {
    organizationId: string;
    sessionId: string;
    runtimeInstanceId: string;
    port: number;
    visibility: PreviewVisibilityValue;
  }): Promise<{ routeId: string; url: string }> {
    const routeId = randomUUID();
    const stablePrefix = createHash("sha256")
      .update(`${input.organizationId}:${input.sessionId}:${input.runtimeInstanceId}:${input.port}`)
      .digest("hex")
      .slice(0, 12);
    const baseUrl = process.env.TRACE_PREVIEW_BASE_URL ?? "https://preview.trace.dev";
    const url = `${baseUrl.replace(/\/$/, "")}/${stablePrefix}-${routeId.slice(0, 8)}`;
    return { routeId, url };
  }

  async revokeRoute(_routeId: string): Promise<void> {
    return;
  }
}

export const previewGatewayAdapter: PreviewGatewayAdapter = new DevPreviewGatewayAdapter();
