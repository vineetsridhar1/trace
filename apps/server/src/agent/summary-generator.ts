/**
 * Summary Generator — calls a cheap LLM (Haiku-class) to produce structured
 * entity summaries from a list of events and an optional previous summary.
 *
 * Part of ticket #09 (Entity Summaries).
 */

import type { LLMAssistantContentBlock, LLMResponse } from "@trace/shared";
import { getAgentLLMAdapter, withRetry } from "./llm-adapter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummaryEvent {
  id: string;
  eventType: string;
  actorType: string;
  actorId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface StructuredSummary {
  /** Free-form narrative summary. */
  narrative: string;
  /** Key decisions made in this scope. */
  decisions: string[];
  /** Open questions that are unresolved. */
  openQuestions: string[];
  /** Action items identified. */
  actionItems: string[];
  /** Active blockers. */
  blockers: string[];
  /** Notable entities (people, tickets, sessions) referenced. */
  entitiesReferenced: string[];
}

export interface GenerateSummaryInput {
  entityType: string;
  entityId: string;
  events: SummaryEvent[];
  previousSummary?: string;
}

export interface GenerateSummaryResult {
  content: string;
  structuredData: StructuredSummary;
  inputTokens: number;
  outputTokens: number;
}

// ---------------------------------------------------------------------------
// Default model — Haiku-class for cost efficiency
// ---------------------------------------------------------------------------

const SUMMARY_MODEL = process.env.AGENT_SUMMARY_MODEL ?? "claude-haiku-4-5-20251001";

// LLM adapter — uses shared singleton from llm-adapter.ts

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a precise summarization engine for a project management and development platform called Trace.

Your job is to produce a structured, factual summary of recent events in a scope (channel, ticket, session, etc.).

Rules:
- Be factual and concise. Do not speculate or editorialize.
- If a previous summary is provided, integrate new events into it — do not repeat information already captured.
- Extract structured fields: decisions, open questions, action items, blockers, and entities referenced.
- Output valid JSON matching the schema below. No markdown, no code fences, just raw JSON.

Output JSON schema:
{
  "narrative": "string — 2-5 sentence factual summary of what happened",
  "decisions": ["string — each key decision made"],
  "openQuestions": ["string — unresolved questions"],
  "actionItems": ["string — things that need to be done"],
  "blockers": ["string — things blocking progress"],
  "entitiesReferenced": ["string — people, tickets, sessions, etc. mentioned"]
}`;

function buildUserPrompt(input: GenerateSummaryInput): string {
  const parts: string[] = [];

  parts.push(`Entity: ${input.entityType} (${input.entityId})`);

  if (input.previousSummary) {
    parts.push(`\nPrevious summary:\n${input.previousSummary}`);
  }

  parts.push(`\nNew events (${input.events.length}):`);

  for (const event of input.events) {
    const payloadStr = JSON.stringify(event.payload);
    // Truncate very large payloads to keep token count reasonable
    const truncated =
      payloadStr.length > 500 ? payloadStr.slice(0, 500) + "..." : payloadStr;
    parts.push(
      `- [${event.timestamp}] ${event.eventType} by ${event.actorType}:${event.actorId} — ${truncated}`,
    );
  }

  parts.push("\nProduce the JSON summary:");

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateSummary(
  input: GenerateSummaryInput,
): Promise<GenerateSummaryResult> {
  const adapter = getAgentLLMAdapter();
  const userPrompt = buildUserPrompt(input);

  const response: LLMResponse = await withRetry(() =>
    adapter.complete({
      model: SUMMARY_MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1024,
      temperature: 0,
    }),
  );

  // Extract the text content from the response
  const textBlock = response.content.find((b: LLMAssistantContentBlock) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "{}";

  // Parse the structured output
  let structuredData: StructuredSummary;
  try {
    structuredData = JSON.parse(rawText) as StructuredSummary;
  } catch {
    // If parsing fails, wrap the raw text as a narrative-only summary
    structuredData = {
      narrative: rawText,
      decisions: [],
      openQuestions: [],
      actionItems: [],
      blockers: [],
      entitiesReferenced: [],
    };
  }

  return {
    content: structuredData.narrative,
    structuredData,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  };
}
