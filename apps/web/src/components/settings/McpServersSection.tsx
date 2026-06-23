import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, KeyRound, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { McpProviderIcon } from "./McpProviderIcon";

const MCP_CATALOG_QUERY = gql`
  query McpCatalog($orgId: ID!) {
    mcpCatalog(orgId: $orgId) {
      id
      name
      transport
      oauthRedirectUri
      needsClientCredentials
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
  oauthRedirectUri: string;
  needsClientCredentials: boolean;
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
  const [credFormId, setCredFormId] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

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

  const enable = useCallback(
    async (catalogId: string, creds?: { clientId: string; clientSecret: string }) => {
      if (!activeOrgId) return;
      setBusyId(catalogId);
      try {
        const result = await client
          .mutation(ENABLE_MCP_SERVER, {
            input: {
              orgId: activeOrgId,
              catalogId,
              ...(creds ? { clientId: creds.clientId, clientSecret: creds.clientSecret } : {}),
            },
          })
          .toPromise();
        if (result.error) throw new Error(result.error.message);
        setCredFormId(null);
        setClientId("");
        setClientSecret("");
        await fetchCatalog();
      } catch (err) {
        toast.error(err instanceof Error ? err.message.replace("[GraphQL] ", "") : "Failed to enable");
      } finally {
        setBusyId(null);
      }
    },
    [activeOrgId, fetchCatalog],
  );

  const handleEnableClick = useCallback(
    (provider: CatalogProvider) => {
      if (provider.needsClientCredentials) {
        setClientId("");
        setClientSecret("");
        setCredFormId((current) => (current === provider.id ? null : provider.id));
        return;
      }
      void enable(provider.id);
    },
    [enable],
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
      let timer: number | undefined;
      let timeout: number | undefined;
      let refreshed = false;
      const refreshOnce = () => {
        if (refreshed) return;
        refreshed = true;
        if (timer !== undefined) window.clearInterval(timer);
        if (timeout !== undefined) window.clearTimeout(timeout);
        window.removeEventListener("focus", refreshOnce);
        void fetchCatalog();
      };
      window.addEventListener("focus", refreshOnce, { once: true });
      const popup = window.open(url, "_blank", "noopener,noreferrer,width=600,height=720");
      if (!popup) {
        timeout = window.setTimeout(refreshOnce, 3000);
        return;
      }
      timer = window.setInterval(() => {
        if (popup.closed) {
          refreshOnce();
        }
      }, 1000);
      timeout = window.setTimeout(refreshOnce, 5 * 60 * 1000);
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
          your cloud coding sessions automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => {
          const connected = provider.enabled && provider.connectionState === "connected";
          const expired = provider.enabled && provider.connectionState === "expired";
          const subtitle = !provider.enabled
            ? provider.needsClientCredentials && isAdmin
              ? "Needs OAuth client credentials"
              : "Not enabled for this org"
            : connected
              ? "Connected"
              : expired
                ? "Connection expired"
                : "Ready to connect";

          return (
            <motion.div
              key={provider.id}
              layout
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={cn(
                "group rounded-xl border bg-surface-elevated p-4 transition-colors",
                connected
                  ? "border-emerald-500/30"
                  : expired
                    ? "border-amber-500/30"
                    : "border-border hover:border-foreground/20",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative">
                    <McpProviderIcon id={provider.id} />
                    {connected && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-elevated bg-emerald-500" />
                    )}
                    {expired && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-elevated bg-amber-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{provider.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {connected && <CheckCircle2 size={15} className="text-emerald-500" />}
                  {expired && <CircleAlert size={15} className="text-amber-500" />}

                  {!provider.enabled ? (
                    isAdmin ? (
                      <Button
                        size="sm"
                        variant={provider.needsClientCredentials ? "outline" : "default"}
                        disabled={busyId === provider.id}
                        onClick={() => handleEnableClick(provider)}
                      >
                        {provider.needsClientCredentials && <KeyRound size={14} />}
                        {busyId === provider.id ? "Enabling..." : "Enable"}
                      </Button>
                    ) : null
                  ) : connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => provider.serverId && void handleDisconnect(provider.serverId)}
                    >
                      <Unplug size={14} />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => provider.serverId && handleConnect(provider.serverId)}
                    >
                      {expired ? "Reconnect" : "Connect"}
                    </Button>
                  )}

                  {isAdmin && provider.serverId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleRemove(provider.serverId!)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {credFormId === provider.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        {provider.name} requires a registered OAuth app. Create one in {provider.name}
                        ’s developer settings (redirect URI{" "}
                        <code className="text-foreground">{provider.oauthRedirectUri}</code>
                        ) and paste its credentials.
                      </p>
                      <Input
                        placeholder="Client ID"
                        value={clientId}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setClientId(e.target.value)
                        }
                      />
                      <Input
                        type="password"
                        placeholder="Client secret"
                        value={clientSecret}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setClientSecret(e.target.value)
                        }
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!clientId.trim() || busyId === provider.id}
                          onClick={() =>
                            void enable(provider.id, {
                              clientId: clientId.trim(),
                              clientSecret: clientSecret.trim(),
                            })
                          }
                        >
                          {busyId === provider.id ? "Saving..." : "Save & enable"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCredFormId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
