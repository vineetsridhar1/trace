/**
 * Tier 2 Planner — receives a context packet and produces a structured decision.
 *
 * The planner calls a workhorse model (Sonnet/Haiku-class) with the full context
 * and action schema. It returns a typed PlannerOutput indicating what the agent
 * should do: ignore, suggest, act, summarize, or escalate.
 *
 * Key design decisions:
 * - Uses tool_use for structured output (reliable JSON vs. raw text parsing)
 * - no_op/ignore is heavily emphasized as the default
 * - Action names are validated against the registry — unknown actions → ignore
 * - Token usage and latency are tracked for cost/telemetry
 *
 * Ticket: #11
 * Dependencies: #06 (Action Registry), #10 (Context Builder)
 */

import type {
  LLMAdapter,
  LLMAssistantContentBlock,
  LLMMessage,
  LLMResponse,
  LLMToolDefinition,
} from "@trace/shared";
import { createLLMAdapter } from "../lib/llm/index.js";
import type { AgentContextPacket } from "./context-builder.js";
import type { AgentActionRegistration } from "./action-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlannerDisposition = "ignore" | "suggest" | "act" | "summarize" | "escalate";

export interface ProposedAction {
  actionType: string;
  args: Record<string, unknown>;
}

export type PromotionTarget = "sonnet" | "opus";

export interface PlannerOutput {
  disposition: PlannerDisposition;
  confidence: number;
  rationaleSummary: string;
  proposedActions: ProposedAction[];
  userVisibleMessage?: string;
  promotionReason?: string;
  /** Which model to escalate to. Only used when disposition is "escalate". Defaults to "sonnet". */
  promotionTarget?: PromotionTarget;
  /** When true, the planner has nothing more to do. Pipeline respects this as a stop hint. */
  done?: boolean;
}

export interface PlannerResult {
  output: PlannerOutput;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Model configuration per tier
// ---------------------------------------------------------------------------

const DEFAULT_TIER2_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_SONNET_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_OPUS_MODEL = "claude-opus-4-20250514";

// ---------------------------------------------------------------------------
// LLM adapter (lazy singleton, same pattern as summary-generator)
// ---------------------------------------------------------------------------

let cachedAdapter: LLMAdapter | null = null;

function getAdapter(): LLMAdapter {
  if (cachedAdapter) return cachedAdapter;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY env var is required for the agent planner");
  }

  cachedAdapter = createLLMAdapter({ provider: "anthropic", apiKey });
  return cachedAdapter;
}

/** Visible for testing — allows injecting a mock adapter. */
export function setAdapterForTest(adapter: LLMAdapter | null): void {
  cachedAdapter = adapter;
}

// ---------------------------------------------------------------------------
// Tool definition for structured output
// ---------------------------------------------------------------------------

const PLANNER_TOOL: LLMToolDefinition = {
  name: "planner_decision",
  description:
    "Output your decision about what the agent should do in response to the events. " +
    "You MUST call this tool exactly once with your decision.",
  inputSchema: {
    type: "object",
    required: ["disposition", "confidence", "rationaleSummary", "proposedActions"],
    properties: {
      disposition: {
        type: "string",
        enum: ["ignore", "suggest", "act", "summarize", "escalate"],
        description:
          "The decision. 'ignore' = do nothing (default, most common). " +
          "'suggest' = propose an action for human approval. " +
          "'act' = execute directly (only for low-risk, high-confidence). " +
          "'summarize' = update a rolling summary. " +
          "'escalate' = promote to Tier 3 for deeper analysis.",
      },
      confidence: {
        type: "number",
        description: "Confidence in this decision, 0.0 to 1.0. Must be >= 0.8 to act.",
      },
      rationaleSummary: {
        type: "string",
        description: "Brief explanation of why this decision was made (1-2 sentences).",
      },
      proposedActions: {
        type: "array",
        description:
          "Actions to take. Empty array for 'ignore'. " +
          "Each action must use an actionType from the provided action schema.",
        items: {
          type: "object",
          required: ["actionType", "args"],
          properties: {
            actionType: {
              type: "string",
              description: "Must be one of the action names from the action schema.",
            },
            args: {
              type: "object",
              description: "Arguments for the action, matching the action's parameter schema.",
            },
          },
        },
      },
      userVisibleMessage: {
        type: "string",
        description:
          "Short message shown to users when suggesting or acting. " +
          "Omit for 'ignore'. Keep concise (1-2 sentences max).",
      },
      promotionReason: {
        type: "string",
        description:
          "If disposition is 'escalate', explain why a more capable model is needed. " +
          "Omit for other dispositions.",
      },
      promotionTarget: {
        type: "string",
        enum: ["sonnet", "opus"],
        description:
          "Which model to escalate to when disposition is 'escalate'. " +
          "'sonnet' for moderate complexity (multi-step reasoning, nuanced responses). " +
          "'opus' for high complexity (deep analysis, complex planning, ambiguous situations). " +
          "Defaults to 'sonnet' if omitted.",
      },
      done: {
        type: "boolean",
        description:
          "Set to true when you have completed all useful actions and have nothing more to do. " +
          "Defaults to false if omitted. The pipeline will stop the loop when this is true.",
      },
    },
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// System prompt construction
// ---------------------------------------------------------------------------

export function buildSystemPrompt(ctx: AgentContextPacket): string {
  const parts: string[] = [];

  // 1. System preamble
  parts.push(SYSTEM_PREAMBLE);

  // 2. Action schema
  parts.push(buildActionSchemaSection(ctx.permissions.actions));

  // 3. Soul file
  if (ctx.soulFile) {
    parts.push(`<soul_file>\n${ctx.soulFile}\n</soul_file>`);
  }

  // 4. Context packet
  parts.push(buildContextSection(ctx));

  return parts.join("\n\n");
}

const SYSTEM_PREAMBLE = `You are the decision-making component of an ambient AI agent for a project management platform called Trace.

You receive context about recent events in a scope (channel, ticket, session, chat) and decide what, if anything, the agent should do.

CRITICAL RULES:
1. MOST EVENTS REQUIRE NO ACTION. "ignore" is the correct response for the vast majority of events. When in doubt, choose "ignore".
2. Only suggest or act when you have HIGH CONFIDENCE that the action will be genuinely helpful.
3. Never invent action names — you MUST pick from the provided action schema. If none fit, choose "ignore".
4. Be concise in any user-visible message (1-2 sentences max).
5. For "act" disposition, confidence must be >= 0.8 and the action must be low-risk.
6. For "suggest" disposition, confidence should be >= 0.5.
7. Below 0.5 confidence, always choose "ignore".
8. Use "escalate" sparingly — only when the task exceeds your capabilities. Set promotionTarget to "sonnet" for moderate complexity or "opus" for very high complexity. Default is "sonnet".
9. Use "summarize" when events are informational and a rolling summary update would be useful, but no user-facing action is needed.
10. Check relevant entities carefully — do NOT suggest creating a ticket if one already exists for the same issue.
11. Check recent events — do NOT suggest actions that have already been taken.

MULTI-TURN LOOP:
- You operate in a loop of up to 10 turns. Each turn, you propose actions, they are executed, and you see the results.
- You may send multiple messages, create tickets, and perform other actions across turns.
- After each turn, you'll receive a tool_result showing what was executed, suggested, or dropped, plus the current turn count.
- Set done=true when you have nothing more to do. The pipeline enforces a hard cap of 10 turns regardless.
- You do NOT need to do everything in one turn. Propose one or a few actions per turn, observe the results, and decide what's next.
- If your first action is to reply to a message, you can then follow up with additional actions in subsequent turns.
- IMPORTANT: Whenever you execute a non-message action (e.g., ticket.create, ticket.addComment), you MUST also send a message in the same or next turn to inform the user what you did. Never take an action silently — always follow up with a brief message.
- SUGGESTED ACTIONS: When the tool_result shows actions in "suggested" (not "executed"), it means the policy downgraded them to suggestions for the user to approve. The system will automatically notify the user about pending suggestions — you do NOT need to send a separate message. Set done=true unless you have additional actions to propose.

You MUST call the planner_decision tool exactly once per turn with your decision.`;

function buildActionSchemaSection(actions: AgentActionRegistration[]): string {
  const entries = actions.map((a) => {
    const params = Object.entries(a.parameters.fields)
      .map(([name, field]) => {
        let desc = `${name}: ${field.type}`;
        if (field.required) desc += " (required)";
        if (field.enum) desc += ` [${field.enum.join(", ")}]`;
        desc += ` — ${field.description}`;
        return desc;
      })
      .join("\n      ");

    return [
      `  - name: ${a.name}`,
      `    risk: ${a.risk}`,
      `    suggestable: ${a.suggestable}`,
      `    description: ${a.description}`,
      params ? `    parameters:\n      ${params}` : `    parameters: (none)`,
    ].join("\n");
  });

  return `<action_schema>\nAvailable actions (you MUST only use these names):\n${entries.join("\n\n")}\n</action_schema>`;
}

function buildContextSection(ctx: AgentContextPacket): string {
  const parts: string[] = [];

  // Scope info — include chat type (DM vs group) when applicable
  const scopeLines = [
    `Type: ${ctx.scopeType}`,
    `ID: ${ctx.scopeId}`,
    `Organization: ${ctx.organizationId}`,
    `Autonomy mode: ${ctx.permissions.autonomyMode}`,
  ];

  // Add chat-specific context hints
  if (ctx.scopeType === "chat" && ctx.scopeEntity) {
    const chatType = ctx.scopeEntity.data.type as string | undefined;
    if (chatType === "dm") {
      scopeLines.push("Chat type: dm (direct message — 1:1 conversation with the user)");
      scopeLines.push(
        "DM behavior: This is a direct conversation with you. The user expects a response EVERY TIME. " +
        "You MUST always reply — use 'act' disposition with a message.send action. " +
        "Do NOT use 'suggest' or 'ignore' in DMs — always reply directly. " +
        "You may also perform additional actions (create tickets, etc.) alongside your reply."
      );
    } else if (chatType === "group") {
      scopeLines.push("Chat type: group (multi-member chat)");
      scopeLines.push(
        "Group chat behavior: You can read all messages. Be more reserved — only act when genuinely helpful. " +
        "@mentions directed at you MUST be treated as direct requests and always receive a reply in thread. " +
        "For non-mention messages, you may choose to ignore, suggest, or act based on relevance."
      );
    }
  }

  // Add channel-specific context hints
  if (ctx.scopeType === "channel") {
    scopeLines.push(
      "Channel behavior: You can read all messages in this channel. " +
      "You should generally observe and only reply when genuinely helpful. " +
      "When replying, ALWAYS use message.sendToChannel (not message.send). " +
      "Prefer threaded replies (set threadId) to minimize noise in the main channel. " +
      "Only post without a threadId for important org-wide announcements or summaries. " +
      "@mentions directed at you MUST always receive a threaded reply."
    );
  }

  // Add session-specific context hints (terminal events only — ongoing monitoring disabled)
  if (ctx.scopeType === "session") {
    const linkedTickets = (ctx.scopeEntity?.data.linkedTickets ?? []) as Array<{
      id: string;
      title: string;
      assignees: Array<{ id: string; name: string | null }>;
    }>;
    const triggerType = ctx.triggerEvent.eventType;

    if (triggerType === "session_terminated" && ctx.triggerEvent.payload.status === "failed") {
      scopeLines.push(
        "FAILED SESSION: This session terminated with a failure. " +
        "If there are linked tickets, notify the assignee(s) via ticket.addComment with what went wrong."
      );
    } else if (triggerType === "session_terminated" || triggerType === "session_pr_opened") {
      scopeLines.push(
        "SESSION COMPLETED: This session has completed or opened a PR. " +
        "If there are linked tickets, post a completion summary via ticket.addComment " +
        "with key information: what was changed, test results, PR link."
      );
    } else if (triggerType === "session_pr_merged" || triggerType === "session_pr_closed") {
      scopeLines.push(
        "SESSION PR UPDATE: A PR from this session was merged or closed. " +
        "If there are linked tickets, consider updating their status."
      );
    }

    if (linkedTickets.length > 0) {
      const ticketList = linkedTickets
        .map((t) => `${t.id} "${t.title}" (assignees: ${t.assignees.map((a) => a.name ?? a.id).join(", ") || "none"})`)
        .join("; ");
      scopeLines.push(`Linked tickets: ${ticketList}`);
    } else {
      scopeLines.push(
        "No linked tickets. Do not try to post comments to nonexistent tickets."
      );
    }
  }

  // Add @mention context hint
  if (ctx.isMention) {
    const replyAction = ctx.scopeType === "channel" ? "message.sendToChannel" : "message.send";
    scopeLines.push(
      "@mention: You were directly @mentioned in this message. " +
      `The user is expecting a helpful reply. Respond with 'act' disposition and a ${replyAction} action. ` +
      "You may also propose additional actions (e.g., ticket.create) alongside the reply."
    );
  }

  parts.push(`<scope>\n${scopeLines.join("\n")}\n</scope>`);

  // Trigger event
  parts.push(
    `<trigger_event>\n${JSON.stringify(ctx.triggerEvent, null, 2)}\n</trigger_event>`,
  );

  // Event batch
  if (ctx.eventBatch.length > 1) {
    parts.push(
      `<event_batch count="${ctx.eventBatch.length}">\n${JSON.stringify(ctx.eventBatch, null, 2)}\n</event_batch>`,
    );
  }

  // Scope entity
  if (ctx.scopeEntity) {
    parts.push(
      `<scope_entity type="${ctx.scopeEntity.type}">\n${JSON.stringify(ctx.scopeEntity.data, null, 2)}\n</scope_entity>`,
    );
  }

  // Relevant entities
  if (ctx.relevantEntities.length > 0) {
    const entityStr = ctx.relevantEntities
      .map(
        (e) =>
          `  [${e.type}:${e.id} hop=${e.hop}] ${JSON.stringify(e.data)}`,
      )
      .join("\n");
    parts.push(`<relevant_entities count="${ctx.relevantEntities.length}">\n${entityStr}\n</relevant_entities>`);
  }

  // Summaries
  if (ctx.summaries.length > 0) {
    const summaryStr = ctx.summaries
      .map(
        (s) =>
          `  [${s.entityType}:${s.entityId} fresh=${s.fresh} events=${s.eventCount}]\n  ${s.content}`,
      )
      .join("\n\n");
    parts.push(`<summaries>\n${summaryStr}\n</summaries>`);
  }

  // Recent events
  if (ctx.recentEvents.length > 0) {
    parts.push(
      `<recent_events count="${ctx.recentEvents.length}">\n${JSON.stringify(ctx.recentEvents, null, 2)}\n</recent_events>`,
    );
  }

  // Actors
  if (ctx.actors.length > 0) {
    const actorStr = ctx.actors
      .map((a) => `  ${a.name} (${a.type}, ${a.role}) — ${a.id}`)
      .join("\n");
    parts.push(`<actors>\n${actorStr}\n</actors>`);
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Output parsing and validation
// ---------------------------------------------------------------------------

const VALID_DISPOSITIONS = new Set<PlannerDisposition>([
  "ignore",
  "suggest",
  "act",
  "summarize",
  "escalate",
]);

const IGNORE_OUTPUT: PlannerOutput = {
  disposition: "ignore",
  confidence: 0,
  rationaleSummary: "Defaulted to ignore due to invalid or missing planner output.",
  proposedActions: [],
};

/**
 * Parse and validate the raw tool_use input from the LLM.
 * Returns a safe PlannerOutput — defaults to ignore on any validation failure.
 */
function parsePlannerOutput(
  raw: Record<string, unknown>,
  availableActions: AgentActionRegistration[],
): PlannerOutput {
  // Validate disposition
  const disposition = raw.disposition as string;
  if (!VALID_DISPOSITIONS.has(disposition as PlannerDisposition)) {
    return {
      ...IGNORE_OUTPUT,
      rationaleSummary: `Invalid disposition "${disposition}" — defaulted to ignore.`,
    };
  }

  // Validate confidence
  let confidence = typeof raw.confidence === "number" ? raw.confidence : 0;
  confidence = Math.max(0, Math.min(1, confidence));

  // Validate rationale
  const rationaleSummary =
    typeof raw.rationaleSummary === "string" && raw.rationaleSummary
      ? raw.rationaleSummary
      : "No rationale provided.";

  // Validate proposed actions
  const rawActions = Array.isArray(raw.proposedActions) ? raw.proposedActions : [];
  const actionNames = new Set(availableActions.map((a) => a.name));
  const proposedActions: ProposedAction[] = [];

  for (const action of rawActions) {
    if (typeof action !== "object" || action === null) continue;
    const a = action as Record<string, unknown>;
    const actionType = typeof a.actionType === "string" ? a.actionType : "";

    // Reject unknown action names — must be in the scope-filtered set
    if (!actionNames.has(actionType)) {
      continue;
    }

    proposedActions.push({
      actionType,
      args: (typeof a.args === "object" && a.args !== null ? a.args : {}) as Record<
        string,
        unknown
      >,
    });
  }

  // If disposition is act/suggest but no valid actions, downgrade to ignore
  if (
    (disposition === "act" || disposition === "suggest") &&
    proposedActions.length === 0
  ) {
    return {
      disposition: "ignore",
      confidence,
      rationaleSummary: `${rationaleSummary} (downgraded: no valid actions)`,
      proposedActions: [],
    };
  }

  const output: PlannerOutput = {
    disposition: disposition as PlannerDisposition,
    confidence,
    rationaleSummary,
    proposedActions,
  };

  if (typeof raw.userVisibleMessage === "string" && raw.userVisibleMessage) {
    output.userVisibleMessage = raw.userVisibleMessage;
  }

  if (typeof raw.promotionReason === "string" && raw.promotionReason) {
    output.promotionReason = raw.promotionReason;
  }

  if (raw.promotionTarget === "sonnet" || raw.promotionTarget === "opus") {
    output.promotionTarget = raw.promotionTarget;
  }

  if (typeof raw.done === "boolean") {
    output.done = raw.done;
  }

  return output;
}

// ---------------------------------------------------------------------------
// Main planner entry point
// ---------------------------------------------------------------------------

export interface PlannerOptions {
  /** Override the model (for testing or Tier 3 promotion). */
  model?: string;
  /** Override the LLM adapter (for testing). */
  adapter?: LLMAdapter;
}

/**
 * Run the Tier 2 planner on a context packet.
 *
 * Returns a structured PlannerResult with the decision, token usage, and latency.
 * On any LLM or parsing failure, returns a safe "ignore" result.
 */
export async function runPlanner(
  ctx: AgentContextPacket,
  options?: PlannerOptions,
): Promise<PlannerResult> {
  const model = options?.model ?? process.env.AGENT_PLANNER_MODEL ?? DEFAULT_TIER2_MODEL;
  const adapter = options?.adapter ?? getAdapter();
  const startTime = Date.now();

  try {
    const systemPrompt = buildSystemPrompt(ctx);

    const response = await adapter.complete({
      model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Analyze the context above and make your decision. " +
            "Call the planner_decision tool with your response.",
        },
      ],
      tools: [PLANNER_TOOL],
      maxTokens: 1024,
      temperature: 0,
    });

    const latencyMs = Date.now() - startTime;

    // Extract tool_use block
    const toolUseBlock = response.content.find(
      (b: LLMAssistantContentBlock) => b.type === "tool_use" && b.name === "planner_decision",
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      // LLM didn't call the tool — default to ignore
      return {
        output: {
          ...IGNORE_OUTPUT,
          rationaleSummary: "LLM did not produce a tool_use response — defaulted to ignore.",
        },
        usage: response.usage,
        latencyMs,
        model: response.model,
      };
    }

    const rawInput = toolUseBlock.input as Record<string, unknown>;
    const output = parsePlannerOutput(rawInput, ctx.permissions.actions);

    return {
      output,
      usage: response.usage,
      latencyMs,
      model: response.model,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const message =
      error instanceof Error ? error.message : "Unknown planner error";

    return {
      output: {
        ...IGNORE_OUTPUT,
        rationaleSummary: `Planner error: ${message} — defaulted to ignore.`,
      },
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs,
      model,
    };
  }
}

// ---------------------------------------------------------------------------
// Multi-turn planner entry point
// ---------------------------------------------------------------------------

export interface PlannerTurnResult {
  output: PlannerOutput;
  /** Raw LLM response — pipeline uses content blocks to build message history */
  response: LLMResponse;
  latencyMs: number;
}

/**
 * Run a single planner turn with a full message history.
 *
 * Unlike `runPlanner`, this does not build the system prompt or construct the
 * initial user message — the pipeline manages those. This is a thin wrapper
 * around the LLM adapter that parses the tool_use output.
 */
export async function runPlannerTurn(
  systemPrompt: string,
  messages: LLMMessage[],
  availableActions: AgentActionRegistration[],
  options?: PlannerOptions,
): Promise<PlannerTurnResult> {
  const model = options?.model ?? process.env.AGENT_PLANNER_MODEL ?? DEFAULT_TIER2_MODEL;
  const adapter = options?.adapter ?? getAdapter();
  const startTime = Date.now();

  const response = await adapter.complete({
    model,
    system: systemPrompt,
    messages,
    tools: [PLANNER_TOOL],
    maxTokens: 1024,
    temperature: 0,
  });

  const latencyMs = Date.now() - startTime;

  const toolUseBlock = response.content.find(
    (b: LLMAssistantContentBlock) => b.type === "tool_use" && b.name === "planner_decision",
  );

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    return {
      output: {
        ...IGNORE_OUTPUT,
        rationaleSummary: "LLM did not produce a tool_use response — defaulted to ignore.",
        done: true,
      },
      response,
      latencyMs,
    };
  }

  const rawInput = toolUseBlock.input as Record<string, unknown>;
  const output = parsePlannerOutput(rawInput, availableActions);

  return { output, response, latencyMs };
}
