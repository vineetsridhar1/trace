/**
 * Curated catalog of MCP providers Trace supports. Admins enable a provider for
 * their org by catalog id (no free-form URLs); each user then OAuth-connects
 * their own account.
 *
 * Providers fall into two auth strategies, differing only in how Trace obtains
 * the OAuth *client* — the per-user authorization-code + PKCE flow is identical:
 *   - "dcr": the provider supports open Dynamic Client Registration, so Trace
 *     self-registers a client at enable time (zero deployment config).
 *   - "preregistered": the provider gates DCR, so Trace uses a single OAuth app
 *     registered out-of-band, with client credentials supplied via deployment
 *     env vars (one Trace app per provider, every user still consents
 *     individually).
 */

export type McpAuthStrategy =
  | { strategy: "dcr" }
  | { strategy: "preregistered"; clientIdEnv: string; clientSecretEnv?: string };

export interface McpCatalogEntry {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  /** Optional explicit scope; falls back to the authorization server's advertised scopes. */
  scope?: string;
  auth: McpAuthStrategy;
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "linear",
    name: "Linear",
    url: "https://mcp.linear.app/mcp",
    transport: "http",
    auth: { strategy: "dcr" },
  },
  {
    id: "sentry",
    name: "Sentry",
    url: "https://mcp.sentry.dev/mcp",
    transport: "http",
    auth: { strategy: "dcr" },
  },
  {
    id: "notion",
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    transport: "http",
    auth: { strategy: "dcr" },
  },
  {
    id: "figma",
    name: "Figma",
    url: "https://mcp.figma.com/mcp",
    transport: "http",
    scope: "mcp:connect",
    auth: {
      strategy: "preregistered",
      clientIdEnv: "MCP_FIGMA_CLIENT_ID",
      clientSecretEnv: "MCP_FIGMA_CLIENT_SECRET",
    },
  },
];

export function getMcpCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((entry) => entry.id === id);
}

/**
 * Whether a provider can currently be enabled. DCR providers are always
 * available; pre-registered ones require their client credentials to be
 * configured in the environment.
 */
export function isCatalogEntryAvailable(entry: McpCatalogEntry): boolean {
  if (entry.auth.strategy === "dcr") return true;
  const clientId = process.env[entry.auth.clientIdEnv]?.trim();
  if (!clientId) return false;
  if (entry.auth.clientSecretEnv) {
    return Boolean(process.env[entry.auth.clientSecretEnv]?.trim());
  }
  return true;
}

/** Resolve pre-registered client credentials from the environment. */
export function preregisteredClient(
  entry: McpCatalogEntry,
): { clientId: string; clientSecret?: string } | null {
  if (entry.auth.strategy !== "preregistered") return null;
  const clientId = process.env[entry.auth.clientIdEnv]?.trim();
  if (!clientId) return null;
  const clientSecret = entry.auth.clientSecretEnv
    ? process.env[entry.auth.clientSecretEnv]?.trim() || undefined
    : undefined;
  return { clientId, clientSecret };
}
