type PreviewEndpoint = {
  id: string;
  sessionGroupId: string;
  appConfigId: string;
  processConfigId: string;
  status: string;
  url?: string | null;
};

// An enabled endpoint is the readiness signal on its own. Forwarding no longer
// requires a Trace-managed process, so holding the skeleton until one reports
// "running" would hide a working preview whenever the app was started by an
// agent or by hand.
export function findReadyPreviewEndpoint<T extends PreviewEndpoint>(
  sessionGroupId: string,
  endpoints: T[],
): T | undefined {
  return endpoints.find(
    (endpoint) =>
      endpoint.sessionGroupId === sessionGroupId &&
      endpoint.status === "enabled" &&
      Boolean(endpoint.url),
  );
}
