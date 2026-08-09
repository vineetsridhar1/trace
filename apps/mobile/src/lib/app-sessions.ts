import type { EntityState, SessionGroupEntity } from "@trace/client-core";
import type { GitCheckpoint, SessionApplicationProcess, SessionEndpoint } from "@trace/gql";

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function appSessionSubtitle({
  agentStatus,
  preview,
  status,
}: {
  agentStatus: string | null | undefined;
  preview: string | null | undefined;
  status: string | null | undefined;
}): string {
  if (status === "needs_input") return "Needs your input";
  if (agentStatus === "failed") return "Build failed";
  if (agentStatus === "active") return "Building now";
  if (preview?.trim()) return preview.trim();
  if (agentStatus === "stopped") return "Stopped";
  return "Ready to continue";
}

export function buildAppSessionGroupIds(state: EntityState): string[] {
  return buildGeneratedProjectSessionGroupIds(state, "app");
}

export function buildDesignSessionGroupIds(state: EntityState): string[] {
  return buildGeneratedProjectSessionGroupIds(state, "design");
}

function buildGeneratedProjectSessionGroupIds(
  state: EntityState,
  kind: "app" | "design",
): string[] {
  return (Object.values(state.sessionGroups) as SessionGroupEntity[])
    .filter((group) => group.kind === kind && !group.archivedAt && group.status !== "archived")
    .sort(
      (a, b) =>
        timestamp(b._sortTimestamp ?? b.updatedAt ?? b.createdAt) -
          timestamp(a._sortTimestamp ?? a.updatedAt ?? a.createdAt) || a.id.localeCompare(b.id),
    )
    .map((group) => group.id);
}

export function findReadyAppPreviewUrl(
  sessionGroupId: string,
  endpoints: SessionEndpoint[],
  processes: SessionApplicationProcess[],
): string | null {
  const endpointId = findReadyAppPreviewEndpointId(sessionGroupId, endpoints, processes);
  return endpoints.find((endpoint) => endpoint.id === endpointId)?.url ?? null;
}

/**
 * Finds the endpoint whose short-lived preview credential should be loaded.
 * Endpoint URLs are private, so mobile must request a credential before opening
 * one in a WebView.
 */
export function findReadyAppPreviewEndpointId(
  sessionGroupId: string,
  endpoints: SessionEndpoint[],
  processes: SessionApplicationProcess[],
): string | null {
  const runningProcessKeys = new Set(
    processes
      .filter(
        (process) => process.sessionGroupId === sessionGroupId && process.status === "running",
      )
      .map((process) => `${process.appConfigId}:${process.processConfigId}`),
  );
  return (
    endpoints.find(
      (endpoint) =>
        endpoint.sessionGroupId === sessionGroupId &&
        endpoint.status === "enabled" &&
        Boolean(endpoint.url) &&
        runningProcessKeys.has(`${endpoint.appConfigId}:${endpoint.processConfigId}`),
    )?.id ?? null
  );
}

/** A saved preview is usable after the container that produced it has stopped. */
export function savedDesignPreviewUrl(
  groupPreviewUrl: string | null | undefined,
  checkpoints: GitCheckpoint[] | null | undefined,
): string | null {
  if (groupPreviewUrl) return groupPreviewUrl;

  return (
    (checkpoints ?? [])
      .filter(
        (checkpoint) => checkpoint.previewStatus === "captured" && Boolean(checkpoint.previewUrl),
      )
      .sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0]?.previewUrl ?? null
  );
}

/** Tells the saved design renderer to omit controls intended for a live canvas. */
export function designPreviewModeUrl(url: string): string {
  const [path, hash] = url.split("#", 2);
  if (/(?:^|[?&])__trace_preview(?:=|&|$)/.test(path)) return url;
  return `${path}${path.includes("?") ? "&" : "?"}__trace_preview=1${hash ? `#${hash}` : ""}`;
}

export function isLivePreviewRuntimeAvailable(state: unknown): boolean {
  return state === "connected" || state === "degraded";
}
