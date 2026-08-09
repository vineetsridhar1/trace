import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  IntegrationConnection,
  IntegrationConnectionKind,
  SupportedAppIntegration,
} from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { useIntegrationStore } from "../../stores/integrations";
import { Button } from "../ui/button";
import { IntegrationProviderCard } from "./IntegrationProviderCard";
import { SettingsStatusPill } from "./SettingsStatusPill";
import {
  CREATE_NANGO_CONNECT_SESSION_MUTATION,
  DELETE_INTEGRATION_CONNECTION_MUTATION,
  INTEGRATION_CONNECTIONS_QUERY,
} from "./integration-operations";

export function NangoConnectionsSection() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const canCreateService = useAuthStore(
    (state) =>
      state.orgMemberships.find((membership) => membership.organizationId === activeOrgId)?.role ===
      "admin",
  );
  const connectionTable = useIntegrationStore((state) => state.connections);
  const connections = useMemo(() => Object.values(connectionTable), [connectionTable]);
  const setConnections = useIntegrationStore((state) => state.setConnections);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const supportedTable = useIntegrationStore((state) => state.supported);
  const integrations = useMemo(() => Object.values(supportedTable), [supportedTable]);
  const setSupported = useIntegrationStore((state) => state.setSupported);
  const [pendingIntegrationId, setPendingIntegrationId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await client
      .query(INTEGRATION_CONNECTIONS_QUERY, {}, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
    setConfigured(Boolean(result.data?.nangoIntegrationConfigured));
    setSupported(
      (result.data?.supportedAppIntegrations as SupportedAppIntegration[] | undefined) ?? [],
    );
    setConnections(
      (result.data?.integrationConnections as IntegrationConnection[] | undefined) ?? [],
    );
  }, [setConnections, setSupported]);

  useEffect(() => {
    void refresh().catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to load connections"),
    );
  }, [refresh]);

  useEffect(() => {
    const refreshOnFocus = () => void refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [refresh]);

  const connect = async (integrationId: string, kind: IntegrationConnectionKind) => {
    setPendingIntegrationId(integrationId);
    try {
      const result = await client
        .mutation(CREATE_NANGO_CONNECT_SESSION_MUTATION, { input: { integrationId, kind } })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      const link = result.data?.createNangoConnectSession?.connectLink as string | undefined;
      if (!link) throw new Error("The connection provider did not return a connect link");
      window.open(link, "_blank", "noopener,noreferrer");
      toast.success("Finish authorizing in the new tab. This page will update automatically.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setPendingIntegrationId(null);
    }
  };

  const disconnect = async (connection: IntegrationConnection) => {
    if (!window.confirm(`Disconnect ${connection.displayName}?`)) return;
    const result = await client
      .mutation(DELETE_INTEGRATION_CONNECTION_MUTATION, { id: connection.id })
      .toPromise();
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Connection removed");
  };

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Database size={16} />
            <h2 className="text-sm font-semibold text-foreground">Application data</h2>
            {configured === false ? (
              <SettingsStatusPill tone="warning" label="Not configured" />
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect an account once, then choose what each Trace app may access.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh connections"
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      {configured ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {integrations.map((integration) => (
            <IntegrationProviderCard
              key={integration.id}
              canCreateService={canCreateService}
              integration={integration}
              connections={connections.filter(
                (connection) => connection.providerConfigKey === integration.providerConfigKey,
              )}
              pending={pendingIntegrationId === integration.id}
              onConnect={(integrationId, kind) => void connect(integrationId, kind)}
              onDisconnect={(connection) => void disconnect(connection)}
            />
          ))}
        </div>
      ) : configured === false ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Ask a Trace administrator to configure the connection provider.
        </p>
      ) : null}
    </div>
  );
}
