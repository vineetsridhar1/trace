import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppIntegrationBinding,
  IntegrationConnection,
  IntegrationExecutionIdentity,
  SupportedAppIntegration,
} from "@trace/gql";
import { client } from "../../../lib/urql";
import { useIntegrationStore } from "../../../stores/integrations";
import {
  APP_INTEGRATIONS_QUERY,
  DELETE_APP_INTEGRATION_BINDING_MUTATION,
  UPSERT_APP_INTEGRATION_BINDING_MUTATION,
} from "./session-applications-operations";

export type AppIntegrationBindingDraft = {
  integrationId: string;
  capabilityIds: string[];
  executionIdentity: IntegrationExecutionIdentity;
  sharedConnectionId: string | null;
};

export function useAppIntegrationBindings(sessionGroupId: string) {
  const connectionTable = useIntegrationStore((state) => state.connections);
  const bindingTable = useIntegrationStore((state) => state.bindingsBySessionGroup[sessionGroupId]);
  const connections = useMemo(() => Object.values(connectionTable), [connectionTable]);
  const bindings = useMemo(() => Object.values(bindingTable ?? {}), [bindingTable]);
  const setConnections = useIntegrationStore((state) => state.setConnections);
  const setBindings = useIntegrationStore((state) => state.setBindings);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const supportedTable = useIntegrationStore((state) => state.supported);
  const supportedIntegrations = useMemo(() => Object.values(supportedTable), [supportedTable]);
  const setSupported = useIntegrationStore((state) => state.setSupported);

  const refresh = useCallback(async () => {
    const result = await client
      .query(APP_INTEGRATIONS_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
    setConnections(
      (result.data?.integrationConnections as IntegrationConnection[] | undefined) ?? [],
    );
    setSupported(
      (result.data?.supportedAppIntegrations as SupportedAppIntegration[] | undefined) ?? [],
    );
    setBindings(
      sessionGroupId,
      (result.data?.appIntegrationBindings as AppIntegrationBinding[] | undefined) ?? [],
    );
  }, [sessionGroupId, setBindings, setConnections, setSupported]);

  useEffect(() => {
    void refresh().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Failed to load data integrations"),
    );
  }, [refresh]);

  const save = async (draft: AppIntegrationBindingDraft) => {
    setPending(true);
    setError(null);
    try {
      const result = await client
        .mutation(UPSERT_APP_INTEGRATION_BINDING_MUTATION, {
          input: {
            sessionGroupId,
            integrationId: draft.integrationId,
            capabilityIds: draft.capabilityIds,
            executionIdentity: draft.executionIdentity,
            sharedConnectionId:
              draft.executionIdentity === "viewer" ? null : draft.sharedConnectionId,
          },
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to save data integration");
      return false;
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await client
        .mutation(DELETE_APP_INTEGRATION_BINDING_MUTATION, { id })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to remove data integration");
    } finally {
      setPending(false);
    }
  };

  return {
    bindings,
    connections,
    error,
    pending,
    refresh,
    remove,
    save,
    supportedIntegrations,
  };
}
