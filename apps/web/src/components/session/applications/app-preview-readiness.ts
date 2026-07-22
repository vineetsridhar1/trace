type PreviewEndpoint = {
  id: string;
  sessionGroupId: string;
  appConfigId: string;
  processConfigId: string;
  status: string;
  url?: string | null;
};

type PreviewProcess = {
  sessionGroupId: string;
  appConfigId: string;
  processConfigId: string;
  status: string;
};

export function isLivePreviewRuntimeAvailable(state: unknown): boolean {
  return state === "connected" || state === "degraded";
}

export function findReadyPreviewEndpoint<T extends PreviewEndpoint>(
  sessionGroupId: string,
  endpoints: T[],
  processes: PreviewProcess[],
): T | undefined {
  const runningProcessKeys = new Set(
    processes
      .filter(
        (process) => process.sessionGroupId === sessionGroupId && process.status === "running",
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
