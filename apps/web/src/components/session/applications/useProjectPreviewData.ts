import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { findReadyPreviewEndpoint } from "./app-preview-readiness";

const PROJECT_PREVIEW_ENDPOINTS_QUERY = gql`
  query AppPreviewState($sessionGroupId: ID!) {
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id sessionGroupId appConfigId processConfigId portConfigId label targetPort url status
      accessMode trafficCaptureMode enabledAt disabledAt revokedAt
    }
    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {
      id sessionGroupId appConfigId processConfigId label status runtimeInstanceId startedAt stoppedAt
      exitCode lastError
    }
  }
`;

export function useProjectPreviewData(sessionGroupId: string, projectKind: "app" | "design") {
  const endpointTable = useEntityStore((s) => s.sessionEndpoints);
  const processTable = useEntityStore((s) => s.sessionApplicationProcesses);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await client
        .query(PROJECT_PREVIEW_ENDPOINTS_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      upsertMany(
        "sessionEndpoints",
        (result.data?.sessionEndpoints as SessionEndpoint[] | undefined) ?? [],
      );
      upsertMany(
        "sessionApplicationProcesses",
        (result.data?.sessionApplicationProcesses as SessionApplicationProcess[] | undefined) ?? [],
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `Failed to load the ${projectKind} preview`,
      );
    }
  }, [projectKind, sessionGroupId, upsertMany]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const endpoint = useMemo(
    () =>
      findReadyPreviewEndpoint(
        sessionGroupId,
        Object.values(endpointTable),
        Object.values(processTable),
      ),
    [endpointTable, processTable, sessionGroupId],
  );

  return { endpoint, error, refresh };
}
