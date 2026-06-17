import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { CheckCircle2, CircleAlert, Plug, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const MCP_SERVERS_QUERY = gql`
  query McpServers($orgId: ID!) {
    mcpServers(orgId: $orgId) {
      id
      orgId
      name
      url
      transport
      enabled
    }
  }
`;

const MY_MCP_CONNECTIONS_QUERY = gql`
  query MyMcpConnections($orgId: ID!) {
    myMcpConnections(orgId: $orgId) {
      mcpServer {
        id
        name
        url
        transport
      }
      state
      expiresAt
      scope
      updatedAt
    }
  }
`;

const CREATE_MCP_SERVER = gql`
  mutation CreateMcpServer($input: CreateMcpServerInput!) {
    createMcpServer(input: $input) {
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

type McpServerRow = {
  id: string;
  orgId: string;
  name: string;
  url: string;
  transport: string;
  enabled: boolean;
};

type McpConnectionRow = {
  mcpServer: { id: string; name: string; url: string; transport: string };
  state: "connected" | "expired" | "disconnected";
  expiresAt: string | null;
  scope: string | null;
  updatedAt: string | null;
};

export function McpServersSection() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const orgMemberships = useAuthStore((s) => s.orgMemberships);
  const isAdmin = useMemo(
    () => orgMemberships.some((m) => m.organizationId === activeOrgId && m.role === "admin"),
    [orgMemberships, activeOrgId],
  );

  const [servers, setServers] = useState<McpServerRow[]>([]);
  const [connections, setConnections] = useState<McpConnectionRow[]>([]);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectionByServerId = useMemo(
    () => new Map(connections.map((c) => [c.mcpServer.id, c] as const)),
    [connections],
  );

  const fetchConnections = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(MY_MCP_CONNECTIONS_QUERY, { orgId: activeOrgId })
      .toPromise();
    if (result.data?.myMcpConnections) {
      setConnections(result.data.myMcpConnections as McpConnectionRow[]);
    }
  }, [activeOrgId]);

  const fetchServers = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(MCP_SERVERS_QUERY, { orgId: activeOrgId }).toPromise();
    if (result.data?.mcpServers) {
      setServers(result.data.mcpServers as McpServerRow[]);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void fetchServers();
    void fetchConnections();
  }, [fetchServers, fetchConnections]);

  const handleCreate = useCallback(async () => {
    if (!activeOrgId || !newName.trim() || !newUrl.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await client
        .mutation(CREATE_MCP_SERVER, {
          input: { orgId: activeOrgId, name: newName.trim(), url: newUrl.trim() },
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      setNewName("");
      setNewUrl("");
      await fetchServers();
      await fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add MCP server");
    } finally {
      setCreating(false);
    }
  }, [activeOrgId, newName, newUrl, fetchServers, fetchConnections]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Remove this MCP server for the whole organization?")) return;
      const result = await client.mutation(DELETE_MCP_SERVER, { id }).toPromise();
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      await fetchServers();
      await fetchConnections();
    },
    [fetchServers, fetchConnections],
  );

  const handleConnect = useCallback(
    (serverId: string) => {
      const url = `${window.location.origin}/mcp/${encodeURIComponent(serverId)}/oauth/start`;
      const popup = window.open(url, "_blank", "noopener,noreferrer,width=600,height=720");
      if (!popup) return;
      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          void fetchConnections();
        }
      }, 1000);
    },
    [fetchConnections],
  );

  const handleDisconnect = useCallback(
    async (serverId: string) => {
      const result = await client.mutation(DISCONNECT_MCP, { mcpServerId: serverId }).toPromise();
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      await fetchConnections();
    },
    [fetchConnections],
  );

  if (!activeOrgId) {
    return <p className="text-sm text-muted-foreground">Select an organization first.</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">MCP Servers</h2>
        <p className="text-sm text-muted-foreground">
          Connect remote MCP servers once; your connection is injected into cloud coding sessions
          automatically.
        </p>
      </div>

      {isAdmin && (
        <div className="rounded-lg border border-border bg-surface-deep p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Add a server</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Name (e.g. Linear)"
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              className="sm:max-w-[200px]"
            />
            <Input
              placeholder="https://mcp.example.com/sse"
              value={newUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUrl(e.target.value)}
            />
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newUrl.trim()}
            >
              {creating ? "Adding..." : "Add"}
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      <div className="space-y-2">
        {servers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No MCP servers configured yet.</p>
        ) : (
          servers.map((server) => {
            const connection = connectionByServerId.get(server.id);
            const state = connection?.state ?? "disconnected";
            return (
              <div
                key={server.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Plug size={16} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{server.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{server.url}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {state === "connected" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle2 size={12} />
                      Connected
                    </span>
                  ) : state === "expired" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                      <CircleAlert size={12} />
                      Expired
                    </span>
                  ) : null}
                  {state === "disconnected" || state === "expired" ? (
                    <Button size="sm" onClick={() => handleConnect(server.id)}>
                      {state === "expired" ? "Reconnect" : "Connect"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDisconnect(server.id)}
                    >
                      <Unplug size={14} />
                      Disconnect
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => void handleDelete(server.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
