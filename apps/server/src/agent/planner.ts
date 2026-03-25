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

import type { LLMAdapter, LLMAssistantContentBlock, LLMToolDefinition } from "@trace/shared";
import { createLLMAdapter } from "../lib/llm/index.js";
import type { AgentContextPacket } from "./context-builder.js";
import type { AgentActionRegistration } from "./action-registry.js";
import { findAction } from "./action-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlannerDisposition = "ignore" | "suggest" | "act" | "summarize" | "escalate";

export interface ProposedAction {
  actionType: string;
  args: Record<string, unknown>;
}

export interface PlannerOutput {
  disposition: PlannerDisposition;
  confidence: number;
  rationaleSummary: string;
  proposedActions: ProposedAction[];
  userVisibleMessage?: string;
  promotionReason?: string;
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
// Default model — Sonnet-class for Tier 2
// ---------------------------------------------------------------------------

const DEFAULT_TIER2_MODEL = "claude-sonnet-4-20250514";

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
          "If disposition is 'escalate', explain why Tier 3 is needed. " +
          "Omit for other dispositions.",
      },
    },
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// System prompt construction
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: AgentContextPacket): string {
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
8. Use "escalate" sparingly — only when a complex situation genuinely needs deeper analysis (Tier 3).
9. Use "summarize" when events are informational and a rolling summary update would be useful, but no user-facing action is needed.
10. Check relevant entities carefully — do NOT suggest creating a ticket if one already exists for the same issue.
11. Check recent events — do NOT suggest actions that have already been taken.

You MUST call the planner_decision tool exactly once with your decision.`;

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

  // Scope info
  parts.push(
    `<scope>\nType: ${ctx.scopeType}\nID: ${ctx.scopeId}\nOrganization: ${ctx.organizationId}\nAutonomy mode: ${ctx.permissions.autonomyMode}\n</scope>`,
  );

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

    // Reject unknown action names
    if (!actionNames.has(actionType) && actionType !== "no_op") {
      continue;
    }

    // Validate the action exists in the registry
    const registeredAction = findAction(actionType);
    if (!registeredAction && actionType !== "no_op") continue;

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
