import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SERVER_URL = process.env.TRACE_SERVER_URL!;
const CHANNEL_ID = process.env.TRACE_CHANNEL_ID!;
const WORKSPACE_ID = process.env.TRACE_WORKSPACE_ID!;
const MODEL = process.env.TRACE_MODEL || "opus";
const EFFORT = process.env.TRACE_EFFORT || "high";

const MAX_TICKETS_PER_SESSION = 10;
let ticketsCreated = 0;

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SERVER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  if (!json.data) {
    throw new Error("No data returned from GraphQL");
  }
  return json.data;
}

const server = new Server(
  { name: "trace", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "create_ticket",
    description: "Create a new ticket/workspace in Trace for a sub-task. Use when you identify work that should run independently or in parallel.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short title for the ticket" },
        prompt: { type: "string", description: "The full prompt/instructions for the agent that will work on this ticket" },
        depends_on_current: { type: "boolean", description: "If true, the new ticket will be queued until the current workspace is merged. Defaults to false." },
        auto_run: { type: "boolean", description: "If true and depends_on_current is false, immediately start running the ticket. Defaults to true." },
      },
      required: ["title", "prompt"],
    },
  },
  {
    name: "list_tickets",
    description: "List current tickets in the Trace channel to see what's already being worked on.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_ticket_status",
    description: "Check the status of a specific workspace/ticket.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workspace_id: { type: "string", description: "The workspace ID to check" },
      },
      required: ["workspace_id"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// ── Tool handlers ────────────────────────────────────────────────────────────

async function handleCreateTicket(args: Record<string, unknown>) {
  const title = args.title as string;
  const prompt = args.prompt as string;
  const depends_on_current = (args.depends_on_current as boolean) ?? false;
  const auto_run = (args.auto_run as boolean) ?? true;

  if (ticketsCreated >= MAX_TICKETS_PER_SESSION) {
    return {
      content: [{ type: "text" as const, text: `Error: Maximum of ${MAX_TICKETS_PER_SESSION} tickets per session reached.` }],
      isError: true,
    };
  }

  // Create workspace
  const createData = await graphql<{
    createWorkspace: { workspace: { id: string; status: string } };
  }>(
    `mutation McpCreateWorkspace($channelId: ID!, $text: String!) {
      createWorkspace(channelId: $channelId, text: $text) {
        workspace { id status }
      }
    }`,
    { channelId: CHANNEL_ID, text: `# ${title}\n\n${prompt}` },
  );

  const newWorkspaceId = createData.createWorkspace.workspace.id;
  ticketsCreated++;

  const runConfig = {
    prompt: `# ${title}\n\n${prompt}`,
    model: MODEL,
    effort: EFFORT,
    planMode: false,
  };

  if (depends_on_current) {
    await graphql(
      `mutation McpSetTicketDependencies($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceIds: [ID!]!, $runConfig: JSON!) {
        setTicketDependencies(channelId: $channelId, workspaceId: $workspaceId, dependsOnWorkspaceIds: $dependsOnWorkspaceIds, runConfig: $runConfig) { id }
      }`,
      {
        channelId: CHANNEL_ID,
        workspaceId: newWorkspaceId,
        dependsOnWorkspaceIds: [WORKSPACE_ID],
        runConfig,
      },
    );

    return {
      content: [{ type: "text" as const, text: `Created ticket "${title}" (workspace ${newWorkspaceId}). Queued — will auto-run after current workspace is merged.` }],
    };
  }

  if (auto_run) {
    await graphql(
      `mutation TriggerWorkspaceRun($channelId: ID!, $workspaceId: ID!, $runConfig: JSON!) {
        triggerWorkspaceRun(channelId: $channelId, workspaceId: $workspaceId, runConfig: $runConfig)
      }`,
      {
        channelId: CHANNEL_ID,
        workspaceId: newWorkspaceId,
        runConfig,
      },
    );

    return {
      content: [{ type: "text" as const, text: `Created ticket "${title}" (workspace ${newWorkspaceId}). Auto-run triggered.` }],
    };
  }

  return {
    content: [{ type: "text" as const, text: `Created ticket "${title}" (workspace ${newWorkspaceId}). Status: pending (not auto-running).` }],
  };
}

async function handleListTickets() {
  const data = await graphql<{
    board: Array<{
      name: string;
      slug: string;
      tickets: Array<{
        id: string;
        title: string;
        status: string;
        workspace: { id: string; status: string; branch: string | null } | null;
      }>;
    }>;
  }>(
    `query McpBoard($channelId: ID!) {
      board(channelId: $channelId) {
        name
        slug
        tickets {
          id
          title
          status
          workspace { id status branch }
        }
      }
    }`,
    { channelId: CHANNEL_ID },
  );

  const lines: string[] = [];
  for (const column of data.board) {
    if (column.tickets.length === 0) continue;
    lines.push(`## ${column.name}`);
    for (const ticket of column.tickets) {
      const ws = ticket.workspace;
      const wsInfo = ws ? ` [${ws.status}]${ws.branch ? ` branch:${ws.branch}` : ""}` : "";
      lines.push(`- ${ticket.title} (workspace: ${ws?.id ?? "none"})${wsInfo}`);
    }
    lines.push("");
  }

  return {
    content: [{ type: "text" as const, text: lines.length > 0 ? lines.join("\n") : "No tickets found in this channel." }],
  };
}

async function handleGetTicketStatus(args: Record<string, unknown>) {
  const workspace_id = args.workspace_id as string;

  const data = await graphql<{
    workspace: {
      id: string;
      status: string;
      preview: string | null;
      branch: string | null;
      summary: string | null;
    } | null;
  }>(
    `query McpGetWorkspace($workspaceId: ID!) {
      workspace(id: $workspaceId) {
        id
        status
        preview
        branch
        summary
      }
    }`,
    { workspaceId: workspace_id },
  );

  if (!data.workspace) {
    return {
      content: [{ type: "text" as const, text: `Workspace ${workspace_id} not found.` }],
      isError: true,
    };
  }

  const ws = data.workspace;
  const lines = [
    `Workspace: ${ws.id}`,
    `Status: ${ws.status}`,
    ws.branch ? `Branch: ${ws.branch}` : null,
    ws.preview ? `Preview: ${ws.preview}` : null,
    ws.summary ? `Summary: ${ws.summary}` : null,
  ].filter(Boolean);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "create_ticket":
        return await handleCreateTicket(args ?? {});
      case "list_tickets":
        return await handleListTickets();
      case "get_ticket_status":
        return await handleGetTicketStatus(args ?? {});
      default:
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});

// ── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
