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
import type { AgentContextPacket } from "./context-builder.js";
import type { AgentActionRegistration } from "./action-registry.js";
import { getAgentLLMAdapter, setAgentLLMAdapterForTest, withRetry } from "./llm-adapter.js";
import {
  BLOCK_SYSTEM_PREAMBLE,
  BLOCK_DM_BEHAVIOR,
  BLOCK_GROUP_CHAT_BEHAVIOR,
  BLOCK_CHANNEL_BEHAVIOR,
  BLOCK_SESSION_FAILED,
  BLOCK_SESSION_COMPLETED,
  BLOCK_SESSION_PR_UPDATE,
  BLOCK_MENTION_BEHAVIOR,
  BLOCK_CONTEXT_USAGE,
  getBlockVersions,
} from "./prompt-blocks.js";

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
// LLM adapter — uses shared singleton from llm-adapter.ts
// ---------------------------------------------------------------------------

/** Visible for testing — allows injecting a mock adapter. */
export const setAdapterForTest = setAgentLLMAdapterForTest;

// ---------------------------------------------------------------------------
// Tool definition for structured output
// ---------------------------------------------------------------------------

export const PLANNER_TOOL: LLMToolDefinition = {
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

export interface BuildSystemPromptResult {
  text: string;
  blockVersions: Record<string, number>;
}

export function buildSystemPrompt(ctx: AgentContextPacket): BuildSystemPromptResult {
  const parts: string[] = [];

  // 1. System preamble
  parts.push(BLOCK_SYSTEM_PREAMBLE.content);

  // 2. Action schema
  parts.push(buildActionSchemaSection(ctx.permissions.actions));

  // 3. Soul file
  if (ctx.soulFile) {
    parts.push(`<soul_file>\n${ctx.soulFile}\n</soul_file>`);
  }

  parts.push(BLOCK_CONTEXT_USAGE.content);

  // 4. Context packet
  parts.push(buildContextSection(ctx));

  return {
    text: parts.join("\n\n"),
    blockVersions: getBlockVersions(),
  };
}

function isRawContextDebugEnabled(): boolean {
  return process.env.AGENT_DEBUG_RAW_CONTEXT === "1";
}

function buildActionSchemaSection(actions: AgentActionRegistration[]): string {
  const coreActions = actions.filter((a) => a.tier === "core");
  const extendedActions = actions.filter((a) => a.tier === "extended");

  // Core actions: full schema
  const coreEntries = coreActions.map((a) => {
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
      `    risk: ${a.risk} | suggestable: ${a.suggestable}`,
      `    description: ${a.description}`,
      params ? `    parameters:\n      ${params}` : `    parameters: (none)`,
    ].join("\n");
  });

  // Extended actions: one-line catalog entries
  const extendedEntries = extendedActions.map((a) => {
    const desc = a.catalogDescription ?? a.description;
    return `  - ${a.name} — ${desc}`;
  });

  const parts = [
    "<action_schema>",
    "Available actions (you MUST only use these names):",
    "",
    "## Core Actions",
    coreEntries.join("\n\n"),
  ];

  if (extendedEntries.length > 0) {
    parts.push(
      "",
      "## Additional Actions",
      extendedEntries.join("\n"),
      "",
      "To use an additional action, provide parameters matching the hints in parentheses. All entity IDs are required strings.",
    );
  }

  parts.push("</action_schema>");
  return parts.join("\n");
}

function buildContextSection(ctx: AgentContextPacket): string {
  return buildCompactContextSection(ctx);
}

function buildScopeSection(ctx: AgentContextPacket): string {
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
      scopeLines.push(BLOCK_DM_BEHAVIOR.content);
    } else if (chatType === "group") {
      scopeLines.push("Chat type: group (multi-member chat)");
      scopeLines.push(BLOCK_GROUP_CHAT_BEHAVIOR.content);
    }
  }

  // Add channel-specific context hints
  if (ctx.scopeType === "channel") {
    scopeLines.push(BLOCK_CHANNEL_BEHAVIOR.content);
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
      scopeLines.push(BLOCK_SESSION_FAILED.content);
    } else if (triggerType === "session_terminated" || triggerType === "session_pr_opened") {
      scopeLines.push(BLOCK_SESSION_COMPLETED.content);
    } else if (triggerType === "session_pr_merged" || triggerType === "session_pr_closed") {
      scopeLines.push(BLOCK_SESSION_PR_UPDATE.content);
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
    const replyAction = ctx.scopeType === "channel" ? "channel.sendMessage" : "message.send";
    scopeLines.push(
      BLOCK_MENTION_BEHAVIOR.content.replace("{replyAction}", replyAction),
    );
  }

  parts.push(`<scope>\n${scopeLines.join("\n")}\n</scope>`);
  return parts.join("\n\n");
}

function buildCompactContextSection(ctx: AgentContextPacket): string {
  const parts: string[] = [buildScopeSection(ctx)];

  parts.push(buildDecisionContextSection(ctx));

  const entitySnapshotSection = buildEntitySnapshotSection(ctx);
  if (entitySnapshotSection) parts.push(entitySnapshotSection);

  const summarySnapshotSection = buildSummarySnapshotSection(ctx);
  if (summarySnapshotSection) parts.push(summarySnapshotSection);

  const memorySnapshotSection = buildMemorySnapshotSection(ctx);
  if (memorySnapshotSection) parts.push(memorySnapshotSection);

  const recentSignalsSection = buildRecentSignalsSection(ctx);
  if (recentSignalsSection) parts.push(recentSignalsSection);

  if (ctx.actors.length > 0) {
    const actorStr = ctx.actors
      .map((a) => `  ${a.name} (${a.type}, ${a.role}) — ${a.id}`)
      .join("\n");
    parts.push(`<actors>\n${actorStr}\n</actors>`);
  }

  if (isRawContextDebugEnabled()) {
    parts.push(buildRawContextDebugSection(ctx));
  }

  return parts.join("\n\n");
}

function buildDecisionContextSection(ctx: AgentContextPacket): string {
  const lines = [
    `trigger_type: ${ctx.decisionContext.triggerType}`,
    `scope_type: ${ctx.decisionContext.scopeType}`,
    `autonomy_mode: ${ctx.decisionContext.autonomyMode}`,
    `is_mention: ${ctx.decisionContext.isMention}`,
  ];

  if (ctx.decisionContext.canonicalState.length > 0) {
    lines.push("canonical_state:");
    for (const fact of ctx.decisionContext.canonicalState) {
      lines.push(`- ${fact}`);
    }
  }

  if (ctx.decisionContext.constraints.length > 0) {
    lines.push("constraints:");
    for (const constraint of ctx.decisionContext.constraints) {
      lines.push(`- ${constraint}`);
    }
  }

  return `<decision_context>\n${lines.join("\n")}\n</decision_context>`;
}

function buildEntitySnapshotSection(ctx: AgentContextPacket): string | null {
  if (ctx.entitySnapshots.length === 0) return null;

  const body = ctx.entitySnapshots
    .map((snapshot) => {
      const facts = snapshot.facts.length > 0 ? ` | ${snapshot.facts.join(" | ")}` : "";
      return `  [${snapshot.type}:${snapshot.id}] ${snapshot.label}${facts}`;
    })
    .join("\n");

  return `<entity_snapshot count="${ctx.entitySnapshots.length}">\n${body}\n</entity_snapshot>`;
}

function buildSummarySnapshotSection(ctx: AgentContextPacket): string | null {
  if (ctx.summaries.length === 0) return null;

  const sections = ctx.summaries.map((summary) => {
    const lines = [
      `  [${summary.entityType}:${summary.entityId} fresh=${summary.fresh} events=${summary.eventCount}]`,
    ];
    const structured = summary.structuredData ?? {};
    const narrative = asString(structured.narrative) ?? summary.content;
    if (narrative) lines.push(`  narrative: ${truncatePromptText(narrative, 220)}`);

    appendSummaryList(lines, "decisions", structured.decisions);
    appendSummaryList(lines, "open_questions", structured.openQuestions);
    appendSummaryList(lines, "action_items", structured.actionItems);
    appendSummaryList(lines, "blockers", structured.blockers);

    return lines.join("\n");
  });

  return `<summary_snapshot>\n${sections.join("\n\n")}\n</summary_snapshot>`;
}

function buildMemorySnapshotSection(ctx: AgentContextPacket): string | null {
  if (!ctx.memories || ctx.memories.length === 0) return null;

  const grouped = new Map<string, string[]>();
  for (const memory of ctx.memories) {
    const group = grouped.get(memory.kind) ?? [];
    group.push(
      `  - ${memory.subjectType}:${memory.subjectId} (confidence=${memory.confidence}) ${truncatePromptText(memory.content, 180)}`,
    );
    grouped.set(memory.kind, group);
  }

  const blocks: string[] = [];
  for (const [kind, entries] of grouped) {
    blocks.push(`[${kind}]\n${entries.join("\n")}`);
  }

  return `<memory_snapshot count="${ctx.memories.length}">\n${blocks.join("\n\n")}\n</memory_snapshot>`;
}

function buildRecentSignalsSection(ctx: AgentContextPacket): string | null {
  if (ctx.recentSignals.length === 0) return null;

  const actorNames = new Map(ctx.actors.map((actor) => [actor.id, actor.name]));
  const body = ctx.recentSignals
    .map((signal) => {
      const actor = resolveSignalActor(signal.actor, actorNames);
      return `  - [${formatSignalTimestamp(signal.timestamp)}] ${actor} | ${signal.kind} | ${signal.text}`;
    })
    .join("\n");

  return `<recent_signals count="${ctx.recentSignals.length}">\n${body}\n</recent_signals>`;
}

function buildRawContextDebugSection(ctx: AgentContextPacket): string {
  const parts: string[] = [];
  parts.push(`<trigger_event>\n${JSON.stringify(ctx.triggerEvent, null, 2)}\n</trigger_event>`);

  if (ctx.eventBatch.length > 1) {
    parts.push(
      `<event_batch count="${ctx.eventBatch.length}">\n${JSON.stringify(ctx.eventBatch, null, 2)}\n</event_batch>`,
    );
  }

  if (ctx.scopeEntity) {
    parts.push(
      `<scope_entity type="${ctx.scopeEntity.type}">\n${JSON.stringify(ctx.scopeEntity.data, null, 2)}\n</scope_entity>`,
    );
  }

  if (ctx.relevantEntities.length > 0) {
    const entityStr = ctx.relevantEntities
      .map((e) => `  [${e.type}:${e.id} hop=${e.hop}] ${JSON.stringify(e.data)}`)
      .join("\n");
    parts.push(`<relevant_entities count="${ctx.relevantEntities.length}">\n${entityStr}\n</relevant_entities>`);
  }

  if (ctx.recentEvents.length > 0) {
    parts.push(
      `<recent_events count="${ctx.recentEvents.length}">\n${JSON.stringify(ctx.recentEvents, null, 2)}\n</recent_events>`,
    );
  }

  return parts.join("\n\n");
}

function appendSummaryList(lines: string[], label: string, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) return;
  lines.push(`  ${label}:`);
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    lines.push(`  - ${entry}`);
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function truncatePromptText(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function formatSignalTimestamp(timestamp: string): string {
  return timestamp.replace("T", " ").replace(".000Z", "Z").slice(0, 16);
}

function resolveSignalActor(
  actor: string,
  actorNames: Map<string, string>,
): string {
  if (actor === "system") return "system";
  const [, actorId] = actor.split(":");
  return actorNames.get(actorId) ?? actor;
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
  const adapter = options?.adapter ?? getAgentLLMAdapter();
  const startTime = Date.now();

  try {
    const { text: systemPrompt } = buildSystemPrompt(ctx);

    const response: LLMResponse = await withRetry(() =>
      adapter.complete({
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
      }),
    );

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
  /** The LLM provider that handled this call (e.g. "anthropic", "openai"). */
  provider: string;
  /** maxTokens setting used for this call. */
  maxTokens: number;
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
  const adapter = options?.adapter ?? getAgentLLMAdapter();
  const maxTokens = 1024;
  const startTime = Date.now();

  const response: LLMResponse = await withRetry(() =>
    adapter.complete({
      model,
      system: systemPrompt,
      messages,
      tools: [PLANNER_TOOL],
      maxTokens,
      temperature: 0,
    }),
  );

  const latencyMs = Date.now() - startTime;
  const provider = adapter.provider;

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
      provider,
      maxTokens,
    };
  }

  const rawInput = toolUseBlock.input as Record<string, unknown>;
  const output = parsePlannerOutput(rawInput, availableActions);

  return { output, response, latencyMs, provider, maxTokens };
}
