import type { EntityState, SessionGroupEntity } from "@trace/client-core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAppSessionGroupIds(state: EntityState): string[] {
  return (Object.values(state.sessionGroups) as SessionGroupEntity[])
    .filter((group) => group.kind === "app" && !group.archivedAt && group.status !== "archived")
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
    )?.url ?? null
  );
}
