import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { SessionEndpoint } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";

const APP_PREVIEW_ENDPOINTS_QUERY = gql`
  query AppPreviewEndpoints($sessionGroupId: ID!) {
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      appConfigId
      processConfigId
      portConfigId
      label
      targetPort
      url
      status
      accessMode
      trafficCaptureMode
      enabledAt
      disabledAt
      revokedAt
    }
  }
`;

export function AppSessionPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const endpointTable = useEntityStore((s) => s.sessionEndpoints);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await client
        .query(APP_PREVIEW_ENDPOINTS_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      const endpoints = (result.data?.sessionEndpoints as SessionEndpoint[] | undefined) ?? [];
      upsertMany("sessionEndpoints", endpoints);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load the app preview");
    }
  }, [sessionGroupId, upsertMany]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const endpoint = useMemo(
    () =>
      Object.values(endpointTable).find(
        (candidate) =>
          candidate.sessionGroupId === sessionGroupId &&
          candidate.status === "enabled" &&
          candidate.url,
      ),
    [endpointTable, sessionGroupId],
  );

  if (endpoint) return <AppPreview endpointId={endpoint.id} fill desktopViewport />;

  return <AppPreviewCanvasSkeleton error={error} onRetry={() => void refresh()} />;
}
