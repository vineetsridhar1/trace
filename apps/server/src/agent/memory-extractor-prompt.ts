/**
 * Memory Extractor Prompt — LLM prompt for extracting atomic facts from events.
 *
 * Uses a Haiku-class model to extract structured memories from event batches.
 * Each extracted memory is an atomic, self-contained statement with kind,
 * subject, confidence, and content.
 */

import type { MemoryKind } from "@prisma/client";
import { getAgentLLMAdapter, withRetry } from "./llm-adapter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionEvent {
  id: string;
  eventType: string;
  actorType: string;
  actorId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface ExtractedMemory {
  kind: MemoryKind;
  subjectType: string;
  subjectId: string;
  content: string;
  confidence: number;
  structuredData?: Record<string, unknown>;
}

export interface ExtractionResult {
  memories: ExtractedMemory[];
  inputTokens: number;
  outputTokens: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTRACTION_MODEL = process.env.AGENT_MEMORY_MODEL ?? "claude-haiku-4-5-20251001";

/** Event types that are high-signal for memory extraction. */
export const EXTRACTABLE_EVENT_TYPES = new Set([
  "message_sent",
  "ticket_created",
  "ticket_updated",
  "ticket_commented",
  "ticket_assigned",
  "ticket_unassigned",
  "session_terminated",
  "entity_linked",
  "ticket_linked",
]);

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system. Given a batch of events from a project management platform, extract discrete, atomic facts that would be useful to recall in future conversations.

Each extracted memory must be:
- Atomic: one fact per memory, not a summary
- Self-contained: understandable without the original events
- Durable: likely to remain true for at least days
- Actionable: useful for future decision-making

Memory kinds:
- fact: A verifiable statement about the world ("Project X uses React")
- preference: A user's stated or demonstrated preference ("Alice prefers short PRs")
- decision: A deliberate choice made by someone ("Team decided to use PostgreSQL")
- pattern: A recurring behavior or trend ("Deployments often fail on Fridays")
- relationship: A connection between entities ("Alice is the lead on Project X")

For each memory, identify the primary subject (what the memory is about):
- subjectType: "user", "project", "repo", "team", "channel", "ticket", "session"
- subjectId: the ID of the subject entity

Assign a confidence score (0.5 to 1.0):
- 0.9-1.0: Explicitly stated facts or decisions
- 0.7-0.8: Strong inferences from behavior
- 0.5-0.6: Weak inferences or uncertain patterns

Respond with a JSON array of extracted memories. If no meaningful memories can be extracted, respond with an empty array.

Output format:
[
  {
    "kind": "fact|preference|decision|pattern|relationship",
    "subjectType": "user|project|repo|team|channel|ticket|session",
    "subjectId": "<entity ID>",
    "content": "<atomic statement>",
    "confidence": 0.7
  }
]`;

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

/**
 * Extract memories from a batch of events using LLM.
 */
export async function extractMemories(
  events: ExtractionEvent[],
  scopeContext?: { scopeType: string; scopeId: string },
): Promise<ExtractionResult> {
  if (events.length === 0) {
    return { memories: [], inputTokens: 0, outputTokens: 0 };
  }

  const adapter = getAgentLLMAdapter();

  // Format events for the prompt (truncate large payloads)
  const formattedEvents = events.map((e) => {
    const payload = JSON.stringify(e.payload);
    const truncatedPayload = payload.length > 500 ? payload.slice(0, 500) + "..." : payload;
    return `[${e.timestamp}] ${e.eventType} by ${e.actorType}:${e.actorId} — ${truncatedPayload}`;
  });

  const userPrompt = [
    scopeContext ? `Scope: ${scopeContext.scopeType}:${scopeContext.scopeId}` : "",
    `Events (${events.length}):`,
    ...formattedEvents,
    "",
    "Extract atomic memories from these events. Respond with a JSON array only.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await withRetry(() =>
    adapter.chat({
      model: EXTRACTION_MODEL,
      maxTokens: 1024,
      temperature: 0,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  ) as { content: Array<{ type: string; text?: string }>; usage: { inputTokens: number; outputTokens: number } };

  // Parse the response
  const responseText = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  let memories: ExtractedMemory[] = [];
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
      memories = parsed
        .filter((m) => m.kind && m.subjectType && m.subjectId && m.content)
        .map((m) => ({
          kind: m.kind as MemoryKind,
          subjectType: m.subjectType as string,
          subjectId: m.subjectId as string,
          content: m.content as string,
          confidence: typeof m.confidence === "number" ? m.confidence : 0.7,
          structuredData: m.structuredData as Record<string, unknown> | undefined,
        }));
    }
  } catch {
    // JSON parse failed — return empty
  }

  return {
    memories,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  };
}
