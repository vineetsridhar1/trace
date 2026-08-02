import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppIntegrationBinding,
  IntegrationConnection,
  IntegrationExecutionIdentity,
} from "@trace/gql";
import { client } from "../../../lib/urql";
import { useIntegrationStore } from "../../../stores/integrations";
import {
  APP_INTEGRATIONS_QUERY,
  DELETE_APP_INTEGRATION_BINDING_MUTATION,
  UPSERT_APP_INTEGRATION_BINDING_MUTATION,
} from "./session-applications-operations";

export type AppIntegrationBindingDraft = {
  label: string;
  provider: string;
  providerConfigKey: string;
  executionIdentity: IntegrationExecutionIdentity;
  sharedConnectionId: string | null;
  allowedMethods: string;
  allowedPathPrefixes: string;
};

export function useAppIntegrationBindings(sessionGroupId: string) {
  const connectionTable = useIntegrationStore((state) => state.connections);
  const bindingTable = useIntegrationStore((state) => state.bindingsBySessionGroup[sessionGroupId]);
  const connections = useMemo(() => Object.values(connectionTable), [connectionTable]);
  const bindings = useMemo(() => Object.values(bindingTable ?? {}), [bindingTable]);
  const setConnections = useIntegrationStore((state) => state.setConnections);
  const setBindings = useIntegrationStore((state) => state.setBindings);
  const upsertBinding = useIntegrationStore((state) => state.upsertBinding);
  const removeBinding = useIntegrationStore((state) => state.removeBinding);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const result = await client
      .query(APP_INTEGRATIONS_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
    setConnections(
      (result.data?.integrationConnections as IntegrationConnection[] | undefined) ?? [],
    );
    setBindings(
      sessionGroupId,
      (result.data?.appIntegrationBindings as AppIntegrationBinding[] | undefined) ?? [],
    );
  }, [sessionGroupId, setBindings, setConnections]);

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
            label: draft.label,
            provider: draft.provider,
            providerConfigKey: draft.providerConfigKey,
            executionIdentity: draft.executionIdentity,
            sharedConnectionId:
              draft.executionIdentity === "viewer" ? null : draft.sharedConnectionId,
            allowedMethods: draft.allowedMethods
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            allowedPathPrefixes: draft.allowedPathPrefixes
              .split(/[\n,]/)
              .map((value) => value.trim())
              .filter(Boolean),
          },
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      const binding = result.data?.upsertAppIntegrationBinding as AppIntegrationBinding | undefined;
      if (binding) upsertBinding(binding);
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
      removeBinding(sessionGroupId, id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to remove data integration");
    } finally {
      setPending(false);
    }
  };

  return { bindings, connections, error, pending, refresh, remove, save };
}
