/**
 * Action Registry — maps every action the AI agent can take to a service method
 * with metadata used by the planner, policy engine, and executor.
 *
 * The model never invents actions — it picks from this registry.
 * Adding a new AI-accessible capability requires exactly one step: add a registry entry.
 */

export type RiskLevel = "low" | "medium" | "high";

export type ScopeType = "chat" | "channel" | "ticket" | "session" | "project" | "system";

export interface ParameterField {
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string };
}

export interface ParameterSchema {
  fields: Record<string, ParameterField>;
}

export interface AgentActionRegistration {
  name: string;
  service: string;
  method: string;
  description: string;
  risk: RiskLevel;
  suggestable: boolean;
  parameters: ParameterSchema;
  scopes: ScopeType[];
  requiredPermissions?: string[];
}

const EMPTY_PARAMS: ParameterSchema = { fields: {} };

const actionRegistry: AgentActionRegistration[] = [
  {
    name: "ticket.create",
    service: "ticketService",
    method: "create",
    description:
      "Create a new ticket. Use when a conversation reveals a bug, task, or feature request that should be tracked. Requires a title at minimum.",
    risk: "medium",
    suggestable: true,
    parameters: {
      fields: {
        title: { type: "string", description: "Ticket title", required: true },
        description: { type: "string", description: "Detailed description of the ticket" },
        priority: {
          type: "string",
          description: "Ticket priority level",
          enum: ["low", "medium", "high", "urgent"],
        },
        labels: {
          type: "array",
          description: "Labels to apply to the ticket",
          items: { type: "string" },
        },
        channelId: { type: "string", description: "Channel to associate the ticket with" },
        projectId: { type: "string", description: "Project to associate the ticket with" },
        assigneeIds: {
          type: "array",
          description: "User IDs to assign to the ticket",
          items: { type: "string" },
        },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "ticket.update",
    service: "ticketService",
    method: "update",
    description:
      "Update an existing ticket's fields such as status, priority, labels, or assignees. Use when new information changes the state of a tracked issue.",
    risk: "medium",
    suggestable: true,
    parameters: {
      fields: {
        id: { type: "string", description: "The ticket ID to update", required: true },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        status: {
          type: "string",
          description: "New status",
          enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
        },
        priority: {
          type: "string",
          description: "New priority",
          enum: ["low", "medium", "high", "urgent"],
        },
        labels: {
          type: "array",
          description: "Replace labels",
          items: { type: "string" },
        },
      },
    },
    scopes: ["ticket", "chat", "channel", "session"],
  },
  {
    name: "ticket.addComment",
    service: "ticketService",
    method: "addComment",
    description:
      "Add a comment to an existing ticket. Use to provide updates, context, or analysis on a tracked issue.",
    risk: "medium",
    suggestable: true,
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The ticket to comment on", required: true },
        text: { type: "string", description: "The comment text", required: true },
      },
    },
    scopes: ["ticket", "chat", "channel", "session"],
  },
  {
    name: "message.send",
    service: "chatService",
    method: "sendMessage",
    description:
      "Send a message in a chat. Use to communicate with team members, provide updates, or respond to questions. Only for direct/group chats — channel messages will be added later.",
    risk: "medium",
    suggestable: true,
    parameters: {
      fields: {
        chatId: { type: "string", description: "The chat to send the message in", required: true },
        text: { type: "string", description: "Plain text message content" },
        html: { type: "string", description: "HTML-formatted message content" },
        parentId: { type: "string", description: "Parent message ID for threading" },
      },
    },
    scopes: ["chat"],
  },
  {
    name: "message.sendToChannel",
    service: "channelService",
    method: "sendMessage",
    description:
      "Send a message in a channel thread. Use to communicate with the team in a channel context. Only for channel-scoped conversations — use message.send for direct/group chats.",
    risk: "medium",
    suggestable: true,
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to send the message in", required: true },
        text: { type: "string", description: "Plain text message content" },
        html: { type: "string", description: "HTML-formatted message content" },
        threadId: { type: "string", description: "Thread ID for threaded replies" },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "link.create",
    service: "ticketService",
    method: "link",
    description:
      "Create a link between a ticket and another entity (session, channel, chat, etc.). Use to connect related items for traceability.",
    risk: "low",
    suggestable: true,
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The ticket to link from", required: true },
        entityType: {
          type: "string",
          description: "The type of entity to link to",
          required: true,
          enum: ["session", "channel", "chat", "ticket", "project"],
        },
        entityId: { type: "string", description: "The ID of the entity to link to", required: true },
      },
    },
    scopes: ["ticket", "chat", "channel", "session", "project"],
  },
  {
    name: "session.start",
    service: "sessionService",
    method: "start",
    description:
      "Start a new coding session. This is a high-risk action — only use when there is a clear, well-defined task that requires a coding session and high confidence it will be useful.",
    risk: "high",
    suggestable: true,
    parameters: {
      fields: {
        prompt: { type: "string", description: "The task description / prompt for the session", required: true },
        channelId: { type: "string", description: "Channel to associate the session with" },
        repoId: { type: "string", description: "Repository to work in" },
        tool: {
          type: "string",
          description: "Coding tool to use",
          enum: ["claude_code", "codex", "custom"],
        },
        sessionGroupId: { type: "string", description: "Existing session group to add the session to" },
        sourceSessionId: { type: "string", description: "Session to copy context/workdir from when starting the new session" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session"],
  },
  {
    name: "escalate.toHuman",
    service: "inboxService",
    method: "createItem",
    description:
      "Escalate to a human by creating an inbox notification. Use when the agent encounters something it cannot handle confidently and needs human judgment or intervention.",
    risk: "low",
    suggestable: false,
    parameters: {
      fields: {
        userId: { type: "string", description: "The user to notify", required: true },
        title: { type: "string", description: "Short title for the escalation", required: true },
        summary: { type: "string", description: "Detailed explanation of what needs attention" },
        sourceType: { type: "string", description: "Type of entity that triggered the escalation", required: true },
        sourceId: { type: "string", description: "ID of the entity that triggered the escalation", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project", "system"],
  },
  {
    name: "summary.update",
    service: "summaryService", // Forward reference — created in ticket #09 (Entity Summaries)
    method: "upsert",
    description:
      "Update or create a rolling summary for an entity. Used for silent enrichment — keeping entity summaries up to date as new events occur. This action is never surfaced as a suggestion.",
    risk: "low",
    suggestable: false,
    parameters: {
      fields: {
        entityType: {
          type: "string",
          description: "The type of entity to summarize",
          required: true,
          enum: ["chat", "channel", "ticket", "session"],
        },
        entityId: { type: "string", description: "The ID of the entity to summarize", required: true },
        summary: { type: "string", description: "The updated summary text", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session"],
  },
  {
    name: "ticket.query",
    service: "ticketService",
    method: "searchByRelevance",
    description:
      "Search for tickets by keyword. Use to check if a ticket already exists before creating one, " +
      "to look up the status of a ticket, or to find related work. Returns matching tickets with their current status, priority, and assignees.",
    risk: "low",
    suggestable: false,
    parameters: {
      fields: {
        query: { type: "string", description: "Search keywords to match against ticket titles and descriptions", required: true },
        limit: { type: "number", description: "Maximum number of results to return (default 5, max 10)" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "ticket.get",
    service: "ticketService",
    method: "getById",
    description:
      "Get a specific ticket by its exact ID. Use when a user asks about the status of a specific ticket, " +
      "or when you need to check a ticket's current state before taking action on it. " +
      "Returns the full ticket with status, priority, assignees, and labels, or null if not found.",
    risk: "low",
    suggestable: false,
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The exact ticket ID to look up", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "suggestion.query",
    service: "inboxService",
    method: "listAgentSuggestions",
    description:
      "Query the agent's own pending suggestions (inbox items). Use to check whether a suggestion was already made, " +
      "whether it was accepted or dismissed, or to avoid creating duplicate suggestions. " +
      "Returns inbox items with their status (active, resolved, expired) and payload.",
    risk: "low",
    suggestable: false,
    parameters: {
      fields: {
        status: {
          type: "string",
          description: "Filter by status",
          enum: ["active", "resolved"],
        },
        limit: { type: "number", description: "Maximum number of results to return (default 10, max 25)" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "no_op",
    service: "",
    method: "",
    description:
      "Do nothing. Most events require no action. Choose this when uncertain, when the event is informational, or when acting would not clearly benefit the team. This is the default and most common choice — prefer no_op over low-confidence actions.",
    risk: "low",
    suggestable: false,
    parameters: EMPTY_PARAMS,
    scopes: ["chat", "channel", "ticket", "session", "project", "system"],
  },
];

// ---------------------------------------------------------------------------
// Indexed lookups — O(1) by name, pre-computed by scope
// ---------------------------------------------------------------------------

/** Name → registration map for O(1) lookup. */
const actionsByName = new Map<string, AgentActionRegistration>(
  actionRegistry.map((a) => [a.name, a]),
);

/** Pre-computed actions by scope type — avoids re-filtering on every call. */
const actionsByScopeCache = new Map<ScopeType, AgentActionRegistration[]>();
for (const scope of ["chat", "channel", "ticket", "session", "project", "system"] as ScopeType[]) {
  actionsByScopeCache.set(scope, actionRegistry.filter((a) => a.scopes.includes(scope)));
}

/** Get all registered actions (for building the planner prompt). */
export function getAllActions(): readonly AgentActionRegistration[] {
  return actionRegistry;
}

/** Get actions filtered by scope type (e.g., only actions relevant to "chat" events). */
export function getActionsByScope(scope: ScopeType): AgentActionRegistration[] {
  return actionsByScopeCache.get(scope) ?? [];
}

/** Find a specific action by name. Returns undefined if not found. O(1). */
export function findAction(name: string): AgentActionRegistration | undefined {
  return actionsByName.get(name);
}

/** Validate that action parameters contain all required fields and no unknown fields. */
export function validateActionParams(
  action: AgentActionRegistration,
  params: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const knownFields = new Set(Object.keys(action.parameters.fields));

  // Reject unknown fields to prevent prompt injection / unexpected data
  for (const key of Object.keys(params)) {
    if (!knownFields.has(key)) {
      errors.push(`Unknown field: ${key}`);
    }
  }

  for (const [fieldName, field] of Object.entries(action.parameters.fields)) {
    if (field.required && (params[fieldName] === undefined || params[fieldName] === null)) {
      errors.push(`Missing required field: ${fieldName}`);
    }

    const value = params[fieldName];
    if (value === undefined || value === null) continue;

    if (field.type === "array") {
      if (!Array.isArray(value)) {
        errors.push(`Field ${fieldName} must be an array`);
      } else if (field.items?.type === "string") {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== "string") {
            errors.push(`Field ${fieldName}[${i}] must be a string`);
            break;
          }
        }
      }
    } else if (field.type === "string" && typeof value !== "string") {
      errors.push(`Field ${fieldName} must be a string`);
    } else if (field.type === "number" && typeof value !== "number") {
      errors.push(`Field ${fieldName} must be a number`);
    } else if (field.type === "boolean" && typeof value !== "boolean") {
      errors.push(`Field ${fieldName} must be a boolean`);
    }

    if (field.enum && typeof value === "string" && !field.enum.includes(value)) {
      errors.push(`Field ${fieldName} must be one of: ${field.enum.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
