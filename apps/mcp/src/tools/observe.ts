import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TraceApi } from "../api.js";
import { jsonResult, errorResult, run, CODING_TOOLS, SESSION_CORE_FIELDS } from "./util.js";

const SESSION_FIELDS = `
  ${SESSION_CORE_FIELDS}
  workdir
  prUrl
  costUsd
  inputTokens
  outputTokens
  lastMessageAt
  lastUserMessageAt
  updatedAt
  repo { id name }
  channel { id name }
  createdBy { id name }
`;

export function registerObserveTools(server: McpServer, client: TraceApi): void {
  server.registerTool(
    "list_sessions",
    {
      title: "List sessions",
      description:
        "List AI coding sessions in the organization. Optionally filter by agent status, coding tool, repo, or channel.",
      inputSchema: {
        agentStatus: z
          .enum(["not_started", "active", "done", "failed", "stopped"])
          .optional()
          .describe("Filter by agent execution status."),
        tool: z.enum(CODING_TOOLS).optional().describe("Filter by coding tool."),
        repoId: z.string().optional(),
        channelId: z.string().optional(),
        includeArchived: z.boolean().optional(),
        includeMerged: z.boolean().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args) =>
      run(async () => {
        const organizationId = await client.getOrganizationId();
        const data = await client.request<{ sessions: unknown[] }>(
          `query ($organizationId: ID!, $filters: SessionFilters) {
            sessions(organizationId: $organizationId, filters: $filters) { ${SESSION_FIELDS} }
          }`,
          { organizationId, filters: args },
        );
        return jsonResult(data.sessions);
      }),
  );

  server.registerTool(
    "get_session",
    {
      title: "Get session",
      description:
        "Fetch full detail for a single session by id: status, tool/model, branch, PR url, token usage, and cost.",
      inputSchema: { id: z.string().describe("Session id.") },
    },
    async ({ id }) =>
      run(async () => {
        const data = await client.request<{ session: unknown }>(
          `query ($id: ID!) { session(id: $id) {
            ${SESSION_FIELDS}
            reasoningEffort
            toolSessionId
            worktreeDeleted
            connection { state lastError canRetry }
            queuedMessages { id text position }
          } }`,
          { id },
        );
        if (!data.session) return errorResult(`No session found with id ${id}`);
        return jsonResult(data.session);
      }),
  );

  server.registerTool(
    "search_sessions",
    {
      title: "Search sessions",
      description: "Full-text search across sessions and session groups in the organization.",
      inputSchema: {
        query: z.string().describe("Search query."),
        channelId: z.string().optional().describe("Restrict the search to one channel."),
      },
    },
    async ({ query, channelId }) =>
      run(async () => {
        const data = await client.request<{ searchSessions: unknown }>(
          `query ($query: String!, $channelId: ID) {
            searchSessions(query: $query, channelId: $channelId) {
              sessions { id name agentStatus sessionStatus tool branch }
              sessionGroups { id name status branch }
            }
          }`,
          { query, channelId },
        );
        return jsonResult(data.searchSessions);
      }),
  );

  server.registerTool(
    "session_timeline",
    {
      title: "Get session timeline",
      description:
        "Fetch recent events (messages, output, status changes) for a session, newest-last. Use this to follow what a session is doing.",
      inputSchema: {
        sessionId: z.string().describe("Session id."),
        limit: z.number().int().positive().max(200).optional().describe("Max events (default 50)."),
        excludePayloadTypes: z
          .array(z.string())
          .optional()
          .describe("Event payload types to omit (e.g. noisy output)."),
      },
    },
    async ({ sessionId, limit, excludePayloadTypes }) =>
      run(async () => {
        const organizationId = await client.getOrganizationId();
        const data = await client.request<{ sessionTimeline: unknown }>(
          `query ($organizationId: ID!, $sessionId: ID!, $limit: Int, $excludePayloadTypes: [String!]) {
            sessionTimeline(organizationId: $organizationId, sessionId: $sessionId, limit: $limit, excludePayloadTypes: $excludePayloadTypes) {
              mode
              hasOlder
              items {
                id
                kind
                event { id eventType payload timestamp actor { type id name } }
                collapsed { startTimestamp endTimestamp }
              }
            }
          }`,
          { organizationId, sessionId, limit: limit ?? 50, excludePayloadTypes },
        );
        return jsonResult(data.sessionTimeline);
      }),
  );

  server.registerTool(
    "session_branch_diff",
    {
      title: "Get session branch diff",
      description:
        "List files changed on a session group's branch with per-file additions/deletions. Get the sessionGroupId from get_session.",
      inputSchema: { sessionGroupId: z.string().describe("Session group id.") },
    },
    async ({ sessionGroupId }) =>
      run(async () => {
        const data = await client.request<{ sessionGroupBranchDiff: unknown }>(
          `query ($sessionGroupId: ID!) {
            sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) { path status additions deletions }
          }`,
          { sessionGroupId },
        );
        return jsonResult(data.sessionGroupBranchDiff);
      }),
  );

  server.registerTool(
    "read_session_file",
    {
      title: "Read a file from a session's workdir",
      description: "Read the contents of a file in a session group's working tree.",
      inputSchema: {
        sessionGroupId: z.string().describe("Session group id."),
        filePath: z.string().describe("Path relative to the repo root."),
      },
    },
    async ({ sessionGroupId, filePath }) =>
      run(async () => {
        const data = await client.request<{ sessionGroupFileContent: string }>(
          `query ($sessionGroupId: ID!, $filePath: String!) {
            sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)
          }`,
          { sessionGroupId, filePath },
        );
        return { content: [{ type: "text" as const, text: data.sessionGroupFileContent }] };
      }),
  );

  server.registerTool(
    "list_channels",
    {
      title: "List channels",
      description: "List channels (coding/text spaces) in the organization.",
      inputSchema: {
        memberOnly: z.boolean().optional().describe("Only channels the viewer is a member of."),
      },
    },
    async ({ memberOnly }) =>
      run(async () => {
        const organizationId = await client.getOrganizationId();
        const data = await client.request<{ channels: unknown[] }>(
          `query ($organizationId: ID!, $memberOnly: Boolean) {
            channels(organizationId: $organizationId, memberOnly: $memberOnly) {
              id name type visibility baseBranch memberCount repo { id name }
            }
          }`,
          { organizationId, memberOnly },
        );
        return jsonResult(data.channels);
      }),
  );

  server.registerTool(
    "list_repos",
    {
      title: "List repos",
      description: "List repositories registered in the organization.",
      inputSchema: {},
    },
    async () =>
      run(async () => {
        const organizationId = await client.getOrganizationId();
        const data = await client.request<{ repos: unknown[] }>(
          `query ($organizationId: ID!) {
            repos(organizationId: $organizationId) { id name remoteUrl defaultBranch }
          }`,
          { organizationId },
        );
        return jsonResult(data.repos);
      }),
  );
}
