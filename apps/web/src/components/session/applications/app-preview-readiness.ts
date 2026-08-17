type PreviewEndpoint = {
  id: string;
  sessionGroupId: string;
  appConfigId?: string | null;
  processConfigId?: string | null;
  status: string;
  url?: string | null;
};

type PreviewProcess = {
  sessionGroupId: string;
  appConfigId: string;
  processConfigId: string;
  status: string;
  runtimeInstanceId?: string | null;
};

type PublishedAppDeployment = {
  status: string;
  url?: string | null;
  updatedAt: string;
};

export function isLivePreviewRuntimeAvailable(state: unknown): boolean {
  return state === "connected" || state === "degraded";
}

export function findPublishedAppUrl<T extends PublishedAppDeployment>(
  deployments: T[],
): string | undefined {
  return deployments
    .filter((deployment) => deployment.status === "live" && Boolean(deployment.url))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.url ?? undefined;
}

/**
 * A process row can outlive the container that owned it — a re-provisioned
 * runtime leaves the old row reading "running" while nothing serves it, so the
 * endpoint answers 503 and a live preview never comes up. Treat a row as stale
 * only when both instance ids are known and disagree; either one being unknown
 * keeps the previous behaviour.
 */
function isProcessFromLiveRuntime(
  process: PreviewProcess,
  activeRuntimeInstanceId: string | null | undefined,
): boolean {
  if (!activeRuntimeInstanceId || !process.runtimeInstanceId) return true;
  return process.runtimeInstanceId === activeRuntimeInstanceId;
}

export function findReadyPreviewEndpoint<T extends PreviewEndpoint>({
  sessionGroupId,
  endpoints,
  processes,
  activeRuntimeInstanceId,
}: {
  sessionGroupId: string;
  endpoints: T[];
  processes: PreviewProcess[];
  activeRuntimeInstanceId?: string | null;
}): T | undefined {
  const runningProcessKeys = new Set(
    processes
      .filter(
        (process) =>
          process.sessionGroupId === sessionGroupId &&
          process.status === "running" &&
          isProcessFromLiveRuntime(process, activeRuntimeInstanceId),
      )
      .map((process) => `${process.appConfigId}:${process.processConfigId}`),
  );

  return endpoints.find(
    (endpoint) =>
      endpoint.sessionGroupId === sessionGroupId &&
      endpoint.status === "enabled" &&
      Boolean(endpoint.url) &&
      runningProcessKeys.has(`${endpoint.appConfigId}:${endpoint.processConfigId}`),
  );
}
