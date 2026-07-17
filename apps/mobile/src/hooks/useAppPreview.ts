import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useEntityStore } from "@trace/client-core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";
import { findReadyAppPreviewEndpointId } from "@/lib/app-sessions";
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

const CREATE_PREVIEW_MUTATION = gql`
  mutation MobileCreateSessionEndpointPreview($endpointId: ID!) {
    createSessionEndpointPreview(endpointId: $endpointId) {
      url
    }
  }
`;

interface AppPreviewData {
  sessionEndpoints?: SessionEndpoint[];
  sessionApplicationProcesses?: SessionApplicationProcess[];
}

interface CreatePreviewData {
  createSessionEndpointPreview?: { url: string };
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    setPreviewRevision((revision) => revision + 1);
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

  const endpointId = useMemo(
    () =>
      findReadyAppPreviewEndpointId(
        sessionGroupId,
        Object.values(endpointTable),
        Object.values(processTable),
      ),
    [endpointTable, processTable, sessionGroupId],
  );

  useEffect(() => {
    if (!endpointId) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setError(null);
    void getClient()
      .mutation<CreatePreviewData>(CREATE_PREVIEW_MUTATION, { endpointId })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const url = result.data?.createSessionEndpointPreview?.url;
        if (result.error || !url) {
          setPreviewUrl(null);
          setError(userFacingError(result.error, "Couldn't authorize the app preview."));
          return;
        }
        setPreviewUrl(url);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpointId, previewRevision]);

  return { url: previewUrl, loading: loading || previewLoading, error, refresh };
}
