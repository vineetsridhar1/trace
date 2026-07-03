import { getConfigValue } from "./config.js";
import { ACTIVE_ORG_CONFIG_KEY, graphqlRequest } from "./http.js";

export function requireActiveOrg(): string {
  const orgId = getConfigValue(ACTIVE_ORG_CONFIG_KEY);
  if (!orgId) {
    throw new Error("No active organization. Run `trace login` or `trace org switch <name>`.");
  }
  return orgId;
}

/** Resolve an item by case-insensitive name; unknown names fail with near-matches. */
export function findByName<T extends { name: string }>(items: T[], name: string, kind: string): T {
  const lower = name.toLowerCase();
  const exact = items.filter((item) => item.name.toLowerCase() === lower);
  if (exact.length === 1) return exact[0] as T;
  if (exact.length > 1) {
    throw new Error(`Multiple ${kind}s are named "${name}" — use an ID instead.`);
  }
  const near = items.filter((item) => item.name.toLowerCase().includes(lower));
  const suggestions = (near.length > 0 ? near : items)
    .slice(0, 5)
    .map((item) => `  ${item.name}`)
    .join("\n");
  throw new Error(
    `No ${kind} named "${name}".${suggestions ? ` Did you mean:\n${suggestions}` : ""}`,
  );
}

export interface ResolvedChannel {
  id: string;
  name: string;
  type: string;
}

export async function resolveChannelByName(
  serverUrl: string,
  orgId: string,
  name: string,
): Promise<ResolvedChannel> {
  const data = await graphqlRequest<{ channels: ResolvedChannel[] }>(
    serverUrl,
    "query($orgId: ID!) { channels(organizationId: $orgId) { id name type } }",
    { orgId },
  );
  return findByName(data.channels, name, "channel");
}

export interface ResolvedRepo {
  id: string;
  name: string;
}

export async function resolveRepoByName(
  serverUrl: string,
  orgId: string,
  name: string,
): Promise<ResolvedRepo> {
  const data = await graphqlRequest<{ repos: ResolvedRepo[] }>(
    serverUrl,
    "query($orgId: ID!) { repos(organizationId: $orgId) { id name } }",
    { orgId },
  );
  return findByName(data.repos, name, "repo");
}

export interface ResolvedSession {
  id: string;
  name: string;
  agentStatus: string;
}

/** Resolve a session by full ID or unique ID prefix (as printed by `sessions list`). */
export async function resolveSessionByIdPrefix(
  serverUrl: string,
  orgId: string,
  idPrefix: string,
): Promise<ResolvedSession> {
  const data = await graphqlRequest<{ sessions: ResolvedSession[] }>(
    serverUrl,
    "query($orgId: ID!) { sessions(organizationId: $orgId, filters: { includeArchived: true }) { id name agentStatus } }",
    { orgId },
  );
  const matches = data.sessions.filter((session) => session.id.startsWith(idPrefix));
  if (matches.length === 1) return matches[0] as ResolvedSession;
  if (matches.length > 1) {
    const ids = matches
      .slice(0, 5)
      .map((session) => `  ${session.id} (${session.name})`)
      .join("\n");
    throw new Error(`Session ID prefix "${idPrefix}" is ambiguous:\n${ids}`);
  }
  throw new Error(`No session with ID prefix "${idPrefix}". Run \`trace sessions list\`.`);
}
