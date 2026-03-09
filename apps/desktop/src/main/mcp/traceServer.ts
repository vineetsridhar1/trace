import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERVER_URL = process.env.TRACE_SERVER_URL!;
const CHANNEL_ID = process.env.TRACE_CHANNEL_ID!;
const WORKSPACE_ID = process.env.TRACE_WORKSPACE_ID!;
const CHANNEL_NAME = process.env.TRACE_CHANNEL_NAME || undefined;
const MODEL = process.env.TRACE_MODEL ?? "opus";
const EFFORT = process.env.TRACE_EFFORT ?? "high";
const AUTH_TOKEN = process.env.TRACE_AUTH_TOKEN;
const USER_ID = process.env.TRACE_USER_ID || undefined;

const MAX_TICKETS_PER_SESSION = 10;
let ticketsCreated = 0;

async function gqlFetch<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }
  const res = await fetch(`${SERVER_URL}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  if (!json.data) {
    throw new Error("GraphQL response missing data");
  }
  return json.data;
}

// ── Shared: channel lookup ───────────────────────────────────────────

const CHANNELS_QUERY = `
  query McpChannels {
    channels { id name }
  }
`;

interface ChannelInfo {
  id: string;
  name: string;
}

async function resolveChannelId(channelName?: string): Promise<string> {
  if (!channelName) return CHANNEL_ID;
  const data = await gqlFetch<{ channels: ChannelInfo[] }>(CHANNELS_QUERY);
  const match = data.channels.find(
    (c) => c.name.toLowerCase() === channelName.toLowerCase(),
  );
  if (!match) {
    throw new Error(`Channel "${channelName}" not found. Available: ${data.channels.map((c) => c.name).join(", ")}`);
  }
  return match.id;
}

// ── Tool: list_tickets ──────────────────────────────────────────────

const LIST_TICKETS_QUERY = `
  query McpBoard($channelId: ID!) {
    board(channelId: $channelId) {
      name
      slug
      tickets {
        id
        title
        description
        status
        sortOrder
        workspace {
          id
          status
          branch
          prUrl
          userId
        }
      }
    }
  }
`;

interface BoardColumn {
  name: string;
  slug: string;
  tickets: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    sortOrder: number;
    workspace: {
      id: string;
      status: string;
      branch: string | null;
      prUrl: string | null;
      userId: string | null;
    } | null;
  }>;
}

// ── Tool: get_thread ────────────────────────────────────────────────

const WORKSPACE_EVENTS_QUERY = `
  query McpWorkspaceEvents($channelId: ID!, $workspaceId: ID!, $limit: Int, $offset: Int) {
    workspaceEvents(channelId: $channelId, workspaceId: $workspaceId, limit: $limit, offset: $offset) {
      events {
        id
        hookEventName
        timestamp
        toolName
        toolInput
        lastAssistantMessage
      }
      total
    }
  }
`;

interface WorkspaceEventsResult {
  workspaceEvents: {
    events: Array<{
      id: string;
      hookEventName: string;
      timestamp: string;
      toolName: string | null;
      toolInput: unknown;
      lastAssistantMessage: string | null;
    }>;
    total: number;
  };
}

// ── Tool: get_ticket_status ─────────────────────────────────────────

const GET_WORKSPACE_QUERY = `
  query McpGetWorkspace($workspaceId: ID!) {
    workspace(id: $workspaceId) {
      id
      status
      preview
      branch
      summary
      ticketTitle
    }
  }
`;

interface GetWorkspaceResult {
  workspace: {
    id: string;
    status: string;
    preview: string | null;
    branch: string | null;
    summary: string | null;
    ticketTitle: string | null;
  } | null;
}

// ── Tool: create_ticket ─────────────────────────────────────────────

const CREATE_WORKSPACE_MUTATION = `
  mutation McpCreateWorkspace($channelId: ID!, $text: String!) {
    createWorkspace(channelId: $channelId, text: $text) {
      workspace { id status }
    }
  }
`;

const SET_DEPENDENCIES_MUTATION = `
  mutation McpSetDeps($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceIds: [ID!]!, $runConfig: JSON!) {
    setTicketDependencies(channelId: $channelId, workspaceId: $workspaceId, dependsOnWorkspaceIds: $dependsOnWorkspaceIds, runConfig: $runConfig) {
      id
      status
    }
  }
`;

// ── Tool: write_to_ticket ───────────────────────────────────────────

const APPEND_PROMPT_MUTATION = `
  mutation McpAppendPrompt($channelId: ID!, $workspaceId: ID!, $text: String!, $createNewSession: Boolean) {
    appendPrompt(channelId: $channelId, workspaceId: $workspaceId, text: $text, createNewSession: $createNewSession) {
      workspace { id status }
      session { id }
    }
  }
`;

// triggerWorkspaceRun: for initial runs from pending state (create_ticket)
const TRIGGER_WORKSPACE_RUN_MUTATION = `
  mutation McpTriggerRun($channelId: ID!, $workspaceId: ID!, $runConfig: JSON!) {
    triggerWorkspaceRun(channelId: $channelId, workspaceId: $workspaceId, runConfig: $runConfig)
  }
`;

// requestWorkspaceRun: lightweight, for follow-up runs (write_to_ticket)
const REQUEST_WORKSPACE_RUN_MUTATION = `
  mutation McpRequestRun($channelId: ID!, $workspaceId: ID!, $runConfig: JSON!) {
    requestWorkspaceRun(channelId: $channelId, workspaceId: $workspaceId, runConfig: $runConfig)
  }
`;

// ── MCP Server Setup ────────────────────────────────────────────────

const server = new McpServer({
  name: "trace",
  version: "1.0.0",
});

// list_tickets
server.tool(
  "list_tickets",
  `List tickets on the project board. Defaults to the current channel (${CHANNEL_NAME || CHANNEL_ID}). Can filter by channel name, column (e.g. "todo", "in_progress", "completed", "merged"), and workspace status.`,
  {
    channel_name: z
      .string()
      .optional()
      .describe("Filter by channel name. Defaults to current channel."),
    column: z
      .string()
      .optional()
      .describe('Filter to a specific board column by slug (e.g. "todo", "in_progress", "in_review", "completed", "merged").'),
    status: z
      .string()
      .optional()
      .describe('Filter tickets by workspace status (e.g. "pending", "creation", "in_progress", "completed", "merged", "needs_input").'),
  },
  async ({ channel_name, column, status }) => {
    const channelId = await resolveChannelId(channel_name);
    const data = await gqlFetch<{ board: BoardColumn[] }>(LIST_TICKETS_QUERY, {
      channelId,
    });

    const channelLabel = channel_name || CHANNEL_NAME || CHANNEL_ID;
    const lines: string[] = [`Tickets for channel: ${channelLabel}\n`];

    for (const col of data.board) {
      if (column && col.slug !== column) continue;

      let filtered = status
        ? col.tickets.filter((t) => t.workspace?.status === status)
        : col.tickets;
      if (USER_ID) {
        filtered = filtered.filter((t) => t.workspace?.userId === USER_ID);
      }
      if (filtered.length === 0 && column) {
        lines.push(`## ${col.name} — no matching tickets`);
        continue;
      }
      if (filtered.length === 0) continue;

      const heading = `## ${col.name} (${filtered.length})`;
      lines.push(heading);
      for (const t of filtered) {
        const ws = t.workspace;
        const wsInfo = ws
          ? ` | workspace=${ws.id} status=${ws.status}${ws.branch ? ` branch=${ws.branch}` : ""}${ws.prUrl ? ` pr=${ws.prUrl}` : ""}`
          : "";
        lines.push(`- [${t.status}] ${t.title}${wsInfo}`);
        if (t.description) {
          lines.push(`  ${t.description}`);
        }
      }
      lines.push("");
    }

    if (lines.length <= 1) {
      lines.push("No tickets found matching the filters.");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// get_thread
server.tool(
  "get_thread",
  "Get the conversation thread (events) for a workspace. Defaults to the current workspace. Returns assistant messages and tool calls.",
  {
    workspace_id: z
      .string()
      .optional()
      .describe("Workspace ID to read the thread from. Defaults to current workspace."),
    limit: z
      .number()
      .optional()
      .describe("Max number of events to return (default 50)."),
    offset: z
      .number()
      .optional()
      .describe("Number of events to skip from the start."),
  },
  async ({ workspace_id, limit, offset }) => {
    const targetWorkspace = workspace_id ?? WORKSPACE_ID;
    const data = await gqlFetch<WorkspaceEventsResult>(WORKSPACE_EVENTS_QUERY, {
      channelId: CHANNEL_ID,
      workspaceId: targetWorkspace,
      limit: limit ?? 50,
      offset: offset ?? 0,
    });

    const events = data.workspaceEvents.events;
    const total = data.workspaceEvents.total;
    const lines: string[] = [`Thread for workspace ${targetWorkspace} (${events.length}/${total} events):\n`];

    for (const ev of events) {
      const ts = new Date(ev.timestamp).toISOString();
      if (ev.hookEventName === "Stop" && ev.lastAssistantMessage) {
        lines.push(`[${ts}] Assistant:\n${ev.lastAssistantMessage}\n`);
      } else if (ev.toolName) {
        const inputStr =
          ev.toolInput && typeof ev.toolInput === "object"
            ? JSON.stringify(ev.toolInput).slice(0, 500)
            : "";
        lines.push(`[${ts}] Tool: ${ev.toolName}${inputStr ? ` ${inputStr}` : ""}`);
      } else if (ev.lastAssistantMessage) {
        lines.push(`[${ts}] Assistant:\n${ev.lastAssistantMessage}\n`);
      } else {
        lines.push(`[${ts}] ${ev.hookEventName}`);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// get_ticket_status
server.tool(
  "get_ticket_status",
  "Check the current status of a specific workspace/ticket.",
  {
    workspace_id: z.string().describe("The workspace ID to check."),
  },
  async ({ workspace_id }) => {
    const data = await gqlFetch<GetWorkspaceResult>(GET_WORKSPACE_QUERY, {
      workspaceId: workspace_id,
    });

    if (!data.workspace) {
      return { content: [{ type: "text" as const, text: `Workspace ${workspace_id} not found.` }] };
    }

    const ws = data.workspace;
    const lines = [
      `Workspace: ${ws.id}`,
      `Title: ${ws.ticketTitle ?? "(none)"}`,
      `Status: ${ws.status}`,
      ws.branch ? `Branch: ${ws.branch}` : null,
      ws.summary ? `Summary: ${ws.summary}` : null,
      ws.preview ? `Preview: ${ws.preview}` : null,
    ].filter(Boolean);

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// create_ticket
server.tool(
  "create_ticket",
  "Create a new workspace/ticket for a sub-task. Use this when you want to spin off independent work into a parallel workspace.",
  {
    title: z.string().describe("Short title for the ticket."),
    prompt: z
      .string()
      .describe("The full prompt/instructions for the agent that will work on this ticket."),
    depends_on_current: z
      .boolean()
      .optional()
      .describe("If true, this ticket will be queued to run after the current workspace merges."),
    auto_run: z
      .boolean()
      .optional()
      .describe("If true, immediately start the agent on this ticket (default: true)."),
    interaction_mode: z
      .enum(["code", "plan", "ask"])
      .optional()
      .describe('The interaction mode for the new agent. "code" (default) allows full code changes, "plan" creates a plan for review first, "ask" is read-only analysis.'),
  },
  async ({ title, prompt, depends_on_current, auto_run, interaction_mode }) => {
    if (ticketsCreated >= MAX_TICKETS_PER_SESSION) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Rate limit: max ${MAX_TICKETS_PER_SESSION} tickets per session reached.`,
          },
        ],
        isError: true,
      };
    }

    const fullPrompt = `# ${title}\n\n${prompt}`;
    const createData = await gqlFetch<{
      createWorkspace: { workspace: { id: string; status: string } };
    }>(CREATE_WORKSPACE_MUTATION, { channelId: CHANNEL_ID, text: fullPrompt });

    const newWorkspaceId = createData.createWorkspace.workspace.id;
    ticketsCreated++;

    const runConfig = {
      prompt: fullPrompt,
      model: MODEL,
      effort: EFFORT,
      planMode: interaction_mode === "plan",
      interactionMode: interaction_mode ?? "code",
    };

    if (depends_on_current) {
      await gqlFetch(SET_DEPENDENCIES_MUTATION, {
        channelId: CHANNEL_ID,
        workspaceId: newWorkspaceId,
        dependsOnWorkspaceIds: [WORKSPACE_ID],
        runConfig,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Created ticket "${title}" (workspace=${newWorkspaceId}). Queued to run after current workspace merges.`,
          },
        ],
      };
    }

    const shouldRun = auto_run !== false;
    if (shouldRun) {
      await gqlFetch(TRIGGER_WORKSPACE_RUN_MUTATION, {
        channelId: CHANNEL_ID,
        workspaceId: newWorkspaceId,
        runConfig,
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Created ticket "${title}" (workspace=${newWorkspaceId}).${shouldRun ? " Agent run triggered." : " Ticket is pending."}`,
        },
      ],
    };
  },
);

// write_to_ticket
server.tool(
  "write_to_ticket",
  "Send a follow-up message to an existing workspace and optionally trigger the agent to run on it. By default this triggers a run that resumes the existing Claude session.",
  {
    workspace_id: z.string().describe("The workspace ID to write to."),
    message: z.string().describe("The message or instructions to send to the workspace."),
    create_new_session: z
      .boolean()
      .optional()
      .describe("Whether to create a new session for this message. Defaults to false (appends to the current session). Set to true only when you want to start a completely fresh conversation context."),
    trigger_run: z
      .boolean()
      .optional()
      .describe("Whether to trigger the agent to actually run on this message. Defaults to true. Set to false if you just want to leave a note without spawning the agent."),
    interaction_mode: z
      .enum(["code", "plan", "ask"])
      .optional()
      .describe('The interaction mode for the agent. "code" (default) allows full code changes, "plan" creates a plan for review first, "ask" is read-only analysis.'),
  },
  async ({ workspace_id, message, create_new_session, trigger_run, interaction_mode }) => {
    // Check workspace status before proceeding
    const statusData = await gqlFetch<GetWorkspaceResult>(GET_WORKSPACE_QUERY, {
      workspaceId: workspace_id,
    });
    const currentStatus = statusData.workspace?.status;
    if (currentStatus === "in_progress") {
      return {
        content: [{
          type: "text" as const,
          text: `Cannot write to workspace ${workspace_id}: it is currently in_progress (an agent is already running). Wait for it to finish or stop it first.`,
        }],
        isError: true,
      };
    }
    if (currentStatus === "merged") {
      return {
        content: [{
          type: "text" as const,
          text: `Cannot write to workspace ${workspace_id}: it has already been merged.`,
        }],
        isError: true,
      };
    }

    const data = await gqlFetch<{
      appendPrompt: {
        workspace: { id: string; status: string };
        session: { id: string };
      };
    }>(APPEND_PROMPT_MUTATION, {
      channelId: CHANNEL_ID,
      workspaceId: workspace_id,
      text: message,
      createNewSession: create_new_session === true,
    });

    const ws = data.appendPrompt.workspace;
    const session = data.appendPrompt.session;

    const shouldRun = trigger_run !== false;
    if (shouldRun) {
      const runConfig = {
        prompt: message,
        model: MODEL,
        effort: EFFORT,
        planMode: interaction_mode === "plan",
        followUp: true,
        interactionMode: interaction_mode ?? "code",
      };
      await gqlFetch(REQUEST_WORKSPACE_RUN_MUTATION, {
        channelId: CHANNEL_ID,
        workspaceId: workspace_id,
        runConfig,
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Message sent to workspace ${ws.id} (status=${ws.status}, session=${session.id}).${shouldRun ? " Agent run triggered." : ""}`,
        },
      ],
    };
  },
);

// delete_ticket
const DELETE_WORKSPACE_MUTATION = `
  mutation McpDeleteWorkspace($channelId: ID!, $workspaceId: ID!) {
    deleteWorkspace(channelId: $channelId, workspaceId: $workspaceId)
  }
`;

server.tool(
  "delete_ticket",
  "Delete a ticket/workspace that is no longer needed. Use this to clean up tickets that were created by mistake, are duplicates, or are no longer relevant. Cannot delete workspaces that are currently running (in_progress) or already merged.",
  {
    workspace_id: z.string().describe("The workspace ID of the ticket to delete."),
    reason: z.string().optional().describe("Brief reason for deleting the ticket (for logging purposes)."),
  },
  async ({ workspace_id, reason }) => {
    // Prevent deleting the current workspace
    if (workspace_id === WORKSPACE_ID) {
      return {
        content: [{
          type: "text" as const,
          text: "Cannot delete your own workspace.",
        }],
        isError: true,
      };
    }

    // Check workspace status before proceeding
    const statusData = await gqlFetch<GetWorkspaceResult>(GET_WORKSPACE_QUERY, {
      workspaceId: workspace_id,
    });

    if (!statusData.workspace) {
      return {
        content: [{
          type: "text" as const,
          text: `Workspace ${workspace_id} not found.`,
        }],
        isError: true,
      };
    }

    const currentStatus = statusData.workspace.status;
    if (currentStatus === "in_progress") {
      return {
        content: [{
          type: "text" as const,
          text: `Cannot delete workspace ${workspace_id}: it is currently in_progress (an agent is running). Wait for it to finish or stop it first.`,
        }],
        isError: true,
      };
    }
    if (currentStatus === "merged") {
      return {
        content: [{
          type: "text" as const,
          text: `Cannot delete workspace ${workspace_id}: it has already been merged.`,
        }],
        isError: true,
      };
    }

    await gqlFetch<{ deleteWorkspace: boolean }>(DELETE_WORKSPACE_MUTATION, {
      channelId: CHANNEL_ID,
      workspaceId: workspace_id,
    });

    const title = statusData.workspace.ticketTitle ?? "(untitled)";
    const reasonSuffix = reason ? ` Reason: ${reason}` : "";
    return {
      content: [{
        type: "text" as const,
        text: `Deleted ticket "${title}" (workspace=${workspace_id}).${reasonSuffix}`,
      }],
    };
  },
);

// ── Start server ────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
