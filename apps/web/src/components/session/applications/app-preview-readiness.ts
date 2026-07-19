type PreviewEndpoint = {
  id: string;
  sessionGroupId: string;
  appConfigId: string;
  processConfigId: string;
  status: string;
  url?: string | null;
};

type PreviewProcess = {
  id?: string;
  sessionGroupId: string;
  appConfigId: string;
  processConfigId: string;
  status: string;
};

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

export function findFailedPreviewProcess<T extends PreviewProcess>(
  sessionGroupId: string,
  processes: T[],
): T | undefined {
  return processes.find(
    (process) =>
      process.sessionGroupId === sessionGroupId &&
      (process.status === "failed" || process.status === "exited"),
  );
}
