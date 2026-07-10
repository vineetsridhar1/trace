import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { Globe, RotateCw } from "lucide-react";
import type { SessionEndpoint } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { TraceLoader } from "../../ui/trace-loader";
import { AppPreview } from "./AppPreview";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
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

  if (endpoint) return <AppPreview endpointId={endpoint.id} fill />;

  return (
    <div className="flex h-full items-center justify-center bg-surface-deep px-6">
      <div className="max-w-sm text-center">
        {loading ? (
          <TraceLoader size={20} showLabel={false} className="mx-auto" />
        ) : (
          <Globe size={24} className="mx-auto text-muted-foreground" />
        )}
        <p className="mt-3 text-sm font-medium text-foreground">
          {loading ? "Loading app preview" : "Waiting for app preview"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {error ?? "The website will appear here when its preview endpoint is ready."}
        </p>
        {!loading ? (
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void refresh()}>
            <RotateCw size={13} />
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  );
}
