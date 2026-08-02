import { useCallback, useEffect, useMemo, useState } from "react";
import type { IntegrationConnection, IntegrationConnectionKind } from "@trace/gql";
import { Database, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { useIntegrationStore } from "../../stores/integrations";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsStatusPill } from "./SettingsStatusPill";
import {
  CREATE_NANGO_CONNECT_SESSION_MUTATION,
  DELETE_INTEGRATION_CONNECTION_MUTATION,
  INTEGRATION_CONNECTIONS_QUERY,
} from "./integration-operations";

export function NangoConnectionsSection() {
  const connectionTable = useIntegrationStore((state) => state.connections);
  const connections = useMemo(() => Object.values(connectionTable), [connectionTable]);
  const setConnections = useIntegrationStore((state) => state.setConnections);
  const removeConnection = useIntegrationStore((state) => state.removeConnection);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [providerConfigKey, setProviderConfigKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<IntegrationConnectionKind>("personal");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const result = await client
      .query(INTEGRATION_CONNECTIONS_QUERY, {}, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
    setConfigured(Boolean(result.data?.nangoIntegrationConfigured));
    setConnections(
      (result.data?.integrationConnections as IntegrationConnection[] | undefined) ?? [],
    );
  }, [setConnections]);

  useEffect(() => {
    void refresh().catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to load connections"),
    );
  }, [refresh]);

  const connect = async () => {
    setPending(true);
    try {
      const result = await client
        .mutation(CREATE_NANGO_CONNECT_SESSION_MUTATION, {
          input: { providerConfigKey, displayName, kind },
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      const link = result.data?.createNangoConnectSession?.connectLink as string | undefined;
      if (!link) throw new Error("Nango did not return a connect link");
      window.open(link, "_blank", "noopener,noreferrer");
      toast.success("Finish connecting in the new tab, then refresh this list");
      setDisplayName("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setPending(false);
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
    removeConnection(connection.id);
    toast.success("Connection removed");
  };

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Database size={16} />
            <h2 className="text-sm font-semibold text-foreground">Application data connections</h2>
            {configured === false ? (
              <SettingsStatusPill tone="warning" label="Nango not configured" />
            ) : (
              <SettingsStatusPill tone="success" label="Nango" />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Personal connections can run as each viewer or be explicitly shared. Service connections
            are managed organization identities.
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
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_9rem_auto]">
          <Input
            value={providerConfigKey}
            placeholder="Nango integration key"
            onChange={(event) => setProviderConfigKey(event.target.value)}
          />
          <Input
            value={displayName}
            placeholder="Connection name"
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Select
            value={kind}
            onValueChange={(value) => setKind(value as IntegrationConnectionKind)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="service">Service</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={pending || !providerConfigKey.trim() || !displayName.trim()}
            onClick={() => void connect()}
          >
            <ExternalLink size={14} />
            Connect
          </Button>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No application data connections yet.</p>
        ) : (
          connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-center justify-between rounded-md bg-background/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {connection.displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {connection.provider} · {connection.kind} · {connection.status}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Disconnect ${connection.displayName}`}
                onClick={() => void disconnect(connection)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
