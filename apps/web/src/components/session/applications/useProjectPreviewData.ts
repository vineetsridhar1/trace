import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { findReadyPreviewEndpoint, isLivePreviewRuntimeAvailable } from "./app-preview-readiness";

const SAVED_DESIGN_PREVIEW_RETRY_MS = 3_000;
const MAX_SAVED_DESIGN_PREVIEW_ATTEMPTS = 10;

const PROJECT_PREVIEW_ENDPOINTS_QUERY = gql`
  query AppPreviewState($sessionGroupId: ID!, $includePdf: Boolean!) {
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id sessionGroupId appConfigId processConfigId portConfigId label targetPort url status
      accessMode trafficCaptureMode enabledAt disabledAt revokedAt
    }
    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {
      id sessionGroupId appConfigId processConfigId label status runtimeInstanceId startedAt stoppedAt
      exitCode lastError
    }
    pdfSessionPreviewUrl(sessionGroupId: $sessionGroupId) @include(if: $includePdf)
    pdfSessionDownloadUrl(sessionGroupId: $sessionGroupId) @include(if: $includePdf)
    sessionGroup(id: $sessionGroupId) {
      id
      designPreviewUrl
    }
  }
`;

export function useProjectPreviewData(
  sessionGroupId: string,
  projectKind: "app" | "design" | "pdf" | "animation",
) {
  const endpointTable = useEntityStore((s) => s.sessionEndpoints);
  const processTable = useEntityStore((s) => s.sessionApplicationProcesses);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const patch = useEntityStore((s) => s.patch);
  const pdfExportStatus = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.pdfExportStatus,
  );
  const designPreviewUrl = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.designPreviewUrl as string | null | undefined,
  );
  const activeRuntimeInstanceId = useEntityStore((s) => {
    const connection = s.sessionGroups[sessionGroupId]?.connection;
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
    const value = (connection as Record<string, unknown>).runtimeInstanceId;
    return typeof value === "string" ? value : null;
  });
  const runtimeState = useEntityStore((s) => {
    const connection = s.sessionGroups[sessionGroupId]?.connection;
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
    const value = (connection as Record<string, unknown>).state;
    return typeof value === "string" ? value : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [savedPdfUrl, setSavedPdfUrl] = useState<string | null>(null);
  const [savedPdfDownloadUrl, setSavedPdfDownloadUrl] = useState<string | null>(null);
  const [savedDesignPreviewAttempts, setSavedDesignPreviewAttempts] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await client
        .query(
          PROJECT_PREVIEW_ENDPOINTS_QUERY,
          { sessionGroupId, includePdf: projectKind === "pdf" },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      upsertMany(
        "sessionEndpoints",
        (result.data?.sessionEndpoints as SessionEndpoint[] | undefined) ?? [],
      );
      const group = result.data?.sessionGroup as
        | { id: string; designPreviewUrl?: string | null }
        | null;
      if (group?.id) {
        patch("sessionGroups", group.id, { designPreviewUrl: group.designPreviewUrl ?? null });
      }
      upsertMany(
        "sessionApplicationProcesses",
        (result.data?.sessionApplicationProcesses as SessionApplicationProcess[] | undefined) ?? [],
      );
      setSavedPdfUrl(
        typeof result.data?.pdfSessionPreviewUrl === "string"
          ? result.data.pdfSessionPreviewUrl
          : null,
      );
      setSavedPdfDownloadUrl(
        typeof result.data?.pdfSessionDownloadUrl === "string"
          ? result.data.pdfSessionDownloadUrl
          : null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `Failed to load the ${projectKind} preview`,
      );
    }
  }, [patch, projectKind, sessionGroupId, upsertMany]);

  useEffect(() => {
    void refresh();
  }, [pdfExportStatus, refresh]);

  useEffect(() => {
    setSavedDesignPreviewAttempts(0);
  }, [sessionGroupId]);

  useEffect(() => {
    if (
      projectKind !== "design" ||
      isLivePreviewRuntimeAvailable(runtimeState) ||
      designPreviewUrl
    ) {
      return;
    }
    if (savedDesignPreviewAttempts >= MAX_SAVED_DESIGN_PREVIEW_ATTEMPTS) {
      setError("Saved design preview is still being prepared. Try again in a moment.");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSavedDesignPreviewAttempts((attempts) => attempts + 1);
      void refresh();
    }, SAVED_DESIGN_PREVIEW_RETRY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [
    designPreviewUrl,
    projectKind,
    refresh,
    runtimeState,
    savedDesignPreviewAttempts,
  ]);

  const endpoint = useMemo(
    () =>
      findReadyPreviewEndpoint({
        sessionGroupId,
        endpoints: Object.values(endpointTable),
        processes: Object.values(processTable),
        activeRuntimeInstanceId,
      }),
    [activeRuntimeInstanceId, endpointTable, processTable, sessionGroupId],
  );

  const retry = useCallback(() => {
    setSavedDesignPreviewAttempts(0);
    void refresh();
  }, [refresh]);

  return { endpoint, error, refresh: retry, savedPdfDownloadUrl, savedPdfUrl };
}
