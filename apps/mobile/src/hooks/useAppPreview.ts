import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useEntityStore } from "@trace/client-core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";
import { findReadyAppPreviewUrl } from "@/lib/app-sessions";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";

const APP_PREVIEW_QUERY = gql`
  query MobileAppPreview($sessionGroupId: ID!) {
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
    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      appConfigId
      processConfigId
      label
      status
      runtimeInstanceId
      startedAt
      stoppedAt
      exitCode
      lastError
    }
  }
`;

interface AppPreviewData {
  sessionEndpoints?: SessionEndpoint[];
  sessionApplicationProcesses?: SessionApplicationProcess[];
}

export function useAppPreview(
  sessionGroupId: string,
  enabled: boolean,
): {
  url: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const endpointTable = useEntityStore((state) => state.sessionEndpoints);
  const processTable = useEntityStore((state) => state.sessionApplicationProcesses);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    const result = await getClient()
      .query<AppPreviewData>(
        APP_PREVIEW_QUERY,
        { sessionGroupId },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    if (result.error) {
      setError(userFacingError(result.error, "Couldn't load the app preview."));
      return;
    }
    const store = useEntityStore.getState();
    store.upsertMany("sessionEndpoints", result.data?.sessionEndpoints ?? []);
    store.upsertMany("sessionApplicationProcesses", result.data?.sessionApplicationProcesses ?? []);
  }, [enabled, sessionGroupId]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  const url = useMemo(
    () =>
      findReadyAppPreviewUrl(
        sessionGroupId,
        Object.values(endpointTable),
        Object.values(processTable),
      ),
    [endpointTable, processTable, sessionGroupId],
  );

  return { url, loading, error, refresh };
}
