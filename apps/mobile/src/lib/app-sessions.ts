import type { EntityState, SessionGroupEntity } from "@trace/client-core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";

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
  if (status === "failed" || agentStatus === "failed") return "Build failed";
  if (agentStatus === "active") return "Building now";
  if (preview?.trim()) return preview.trim();
  if (status === "stopped" || agentStatus === "stopped") return "Stopped";
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
