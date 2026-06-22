import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { CheckCircle2, CircleAlert, Plug, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";

const MCP_CATALOG_QUERY = gql`
  query McpCatalog($orgId: ID!) {
    mcpCatalog(orgId: $orgId) {
      id
      name
      transport
      available
      enabled
      serverId
      connectionState
    }
  }
`;

const ENABLE_MCP_SERVER = gql`
  mutation EnableMcpServer($input: EnableMcpServerInput!) {
    enableMcpServer(input: $input) {
      id
    }
  }
`;

const DELETE_MCP_SERVER = gql`
  mutation DeleteMcpServer($id: ID!) {
    deleteMcpServer(id: $id)
  }
`;

const DISCONNECT_MCP = gql`
  mutation DisconnectMcp($mcpServerId: ID!) {
    disconnectMcp(mcpServerId: $mcpServerId)
  }
`;

type CatalogProvider = {
  id: string;
  name: string;
  transport: string;
  available: boolean;
  enabled: boolean;
  serverId: string | null;
  connectionState: "connected" | "expired" | "disconnected";
};

export function McpServersSection() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const orgMemberships = useAuthStore((s) => s.orgMemberships);
  const isAdmin = useMemo(
    () => orgMemberships.some((m) => m.organizationId === activeOrgId && m.role === "admin"),
    [orgMemberships, activeOrgId],
  );

  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(MCP_CATALOG_QUERY, { orgId: activeOrgId }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.data?.mcpCatalog) {
      setProviders(result.data.mcpCatalog as CatalogProvider[]);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const handleEnable = useCallback(
    async (catalogId: string) => {
      if (!activeOrgId) return;
      setBusyId(catalogId);
      try {
        const result = await client
          .mutation(ENABLE_MCP_SERVER, { input: { orgId: activeOrgId, catalogId } })
          .toPromise();
        if (result.error) throw new Error(result.error.message);
        await fetchCatalog();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to enable provider");
      } finally {
        setBusyId(null);
      }
    },
    [activeOrgId, fetchCatalog],
  );

  const handleRemove = useCallback(
    async (serverId: string) => {
      if (!window.confirm("Remove this MCP provider for the whole organization?")) return;
      const result = await client.mutation(DELETE_MCP_SERVER, { id: serverId }).toPromise();
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      await fetchCatalog();
    },
    [fetchCatalog],
  );

  const handleConnect = useCallback(
    (serverId: string) => {
      const url = `${window.location.origin}/mcp/${encodeURIComponent(serverId)}/oauth/start`;
      const popup = window.open(url, "_blank", "noopener,noreferrer,width=600,height=720");
      if (!popup) return;
      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          void fetchCatalog();
        }
      }, 1000);
    },
    [fetchCatalog],
  );

  const handleDisconnect = useCallback(
    async (serverId: string) => {
      const result = await client.mutation(DISCONNECT_MCP, { mcpServerId: serverId }).toPromise();
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      await fetchCatalog();
    },
    [fetchCatalog],
  );

  if (!activeOrgId) {
    return <p className="text-sm text-muted-foreground">Select an organization first.</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">MCP Servers</h2>
        <p className="text-sm text-muted-foreground">
          Connect a supported MCP provider with your own account. Your connection is injected into
          cloud coding sessions automatically.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Plug size={16} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{provider.name}</p>
                <p className="text-xs text-muted-foreground">
                  {!provider.available
                    ? "Unavailable — not configured on this server"
                    : !provider.enabled
                      ? "Not enabled for this org"
                      : provider.connectionState === "connected"
                        ? "Connected"
                        : provider.connectionState === "expired"
                          ? "Connection expired"
                          : "Ready to connect"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {provider.enabled && provider.connectionState === "connected" && (
                <CheckCircle2 size={14} className="text-emerald-500" />
              )}
              {provider.enabled && provider.connectionState === "expired" && (
                <CircleAlert size={14} className="text-amber-500" />
              )}

              {!provider.available ? null : !provider.enabled ? (
                isAdmin ? (
                  <Button
                    size="sm"
                    disabled={busyId === provider.id}
                    onClick={() => void handleEnable(provider.id)}
                  >
                    {busyId === provider.id ? "Enabling..." : "Enable"}
                  </Button>
                ) : null
              ) : provider.connectionState === "connected" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => provider.serverId && void handleDisconnect(provider.serverId)}
                >
                  <Unplug size={14} />
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" onClick={() => provider.serverId && handleConnect(provider.serverId)}>
                  {provider.connectionState === "expired" ? "Reconnect" : "Connect"}
                </Button>
              )}

              {isAdmin && provider.enabled && provider.serverId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => void handleRemove(provider.serverId!)}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
