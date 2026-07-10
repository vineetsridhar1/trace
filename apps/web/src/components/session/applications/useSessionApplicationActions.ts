import { useCallback, useState } from "react";
import type { SessionEndpoint } from "@trace/gql";
import { client } from "../../../lib/urql";
import { useUIStore } from "../../../stores/ui";
import {
  CREATE_PREVIEW_MUTATION,
  DISABLE_ENDPOINT_MUTATION,
  ENABLE_ENDPOINT_MUTATION,
  PUBLISH_APP_MUTATION,
  RUN_SETUP_MUTATION,
  START_PROCESS_MUTATION,
  STOP_PROCESS_MUTATION,
} from "./session-applications-operations";

type EndpointReference = Pick<SessionEndpoint, "accessMode" | "id" | "url">;

function resultError(result: unknown): Error | null {
  if (!result || typeof result !== "object" || !("error" in result)) return null;
  const error = result.error;
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "Application action failed";
  return new Error(message);
}

export function useSessionApplicationActions({
  groupKind,
  loadProcessLogs,
  sessionGroupId,
}: {
  groupKind: string | null | undefined;
  loadProcessLogs: (processId: string) => Promise<void>;
  sessionGroupId: string;
}) {
  const setActivePage = useUIStore((state) => state.setActivePage);
  const setSettingsInitialTab = useUIStore((state) => state.setSettingsInitialTab);
  const [refreshingLogIds, setRefreshingLogIds] = useState<Record<string, boolean>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);

  const execute = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      setPendingKey(key);
      setError(null);
      try {
        const result = await action();
        const error = resultError(result);
        if (error) throw error;
      } catch (cause) {
        reportError(cause);
      } finally {
        setPendingKey(null);
      }
    },
    [reportError],
  );

  const resolveEndpointUrl = useCallback(async (endpoint: EndpointReference) => {
    if (endpoint.accessMode !== "private") return endpoint.url;
    const result = await client
      .mutation(CREATE_PREVIEW_MUTATION, { endpointId: endpoint.id })
      .toPromise();
    return (result.data?.createSessionEndpointPreview?.url as string | undefined) ?? endpoint.url;
  }, []);

  return {
    error,
    pendingKey,
    refreshingLogIds,
    reportError,
    refreshProcessLogs: async (processId: string) => {
      setRefreshingLogIds((current) => ({ ...current, [processId]: true }));
      setError(null);
      try {
        await loadProcessLogs(processId);
      } catch (cause) {
        reportError(cause);
      } finally {
        setRefreshingLogIds((current) => ({ ...current, [processId]: false }));
      }
    },
    runSetup: (scriptId: string) =>
      void execute(scriptId, () =>
        client.mutation(RUN_SETUP_MUTATION, { sessionGroupId, scriptId }).toPromise(),
      ),
    toggleProcess: (appConfigId: string, processConfigId: string, active: boolean) =>
      void execute(`${appConfigId}:${processConfigId}`, () =>
        client
          .mutation(active ? STOP_PROCESS_MUTATION : START_PROCESS_MUTATION, {
            sessionGroupId,
            appConfigId,
            processConfigId,
          })
          .toPromise(),
      ),
    toggleEndpoint: (endpoint: SessionEndpoint) =>
      void execute(endpoint.id, () =>
        client
          .mutation(
            endpoint.status === "enabled" ? DISABLE_ENDPOINT_MUTATION : ENABLE_ENDPOINT_MUTATION,
            endpoint.status === "enabled"
              ? { endpointId: endpoint.id }
              : { endpointId: endpoint.id, accessMode: groupKind === "app" ? "private" : "public" },
          )
          .toPromise(),
      ),
    publish: (endpointId: string) =>
      void execute(`publish:${endpointId}`, () =>
        client.mutation(PUBLISH_APP_MUTATION, { sessionGroupId }).toPromise(),
      ),
    openEndpoint: async (endpoint: EndpointReference) => {
      const url = await resolveEndpointUrl(endpoint);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    copyEndpoint: async (endpoint: EndpointReference) => {
      const url = await resolveEndpointUrl(endpoint);
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        setError(null);
      } catch {
        setError(url);
      }
    },
    openRepositorySettings: () => {
      setSettingsInitialTab("repositories");
      setActivePage("settings");
    },
  };
}
