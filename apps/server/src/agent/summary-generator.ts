/**
 * Summary Generator — calls an LLM to produce structured rolling summaries
 * for long-lived entities (tickets, chats, sessions, etc.).
 *
 * Uses a Haiku-class model for cost efficiency. The prompt instructs
 * factual, structured output — not narrative prose.
 */

import { aiService, SUMMARY_MODEL } from "../services/ai.js";

export interface SummaryEvent {
  eventType: string;
  actorType: string;
  actorId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface SummaryGenerationInput {
  entityType: string;
  entityId: string;
  events: SummaryEvent[];
  previousSummary?: string;
}

export interface SummaryGenerationResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

const SYSTEM_PROMPT = `You are a concise summarizer for a project management and team collaboration platform called Trace. Your job is to produce structured rolling summaries of entity activity.

Output format (use these exact headings, omit empty sections):

## Status
One-line current state of this entity.

## Key Decisions
- Bullet list of decisions made or conclusions reached.

## Action Items
- Bullet list of tasks, assignments, or next steps identified.

## Open Questions
- Bullet list of unresolved questions or ambiguities.

## Blockers
- Bullet list of things blocking progress.

## Entities Referenced
- Bullet list of other tickets, sessions, users, repos, or channels mentioned.

Rules:
- Be factual and specific. Include IDs, names, and timestamps where relevant.
- Compress older information aggressively — recent events matter more.
- Never invent information not present in the events.
- Keep the total summary under 500 words.`;

function formatEvents(events: SummaryEvent[]): string {
  return events
    .map((e) => {
      const payloadStr = formatPayload(e.payload);
      return `[${e.timestamp}] ${e.eventType} by ${e.actorType}:${e.actorId}${payloadStr ? ` — ${payloadStr}` : ""}`;
    })
    .join("\n");
}

function formatPayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];

  // Extract the most useful fields from common event payloads
  if (typeof payload.title === "string") parts.push(`title: "${payload.title}"`);
  if (typeof payload.status === "string") parts.push(`status: ${payload.status}`);
  if (typeof payload.priority === "string") parts.push(`priority: ${payload.priority}`);
  if (typeof payload.text === "string") {
    const text = payload.text as string;
    parts.push(`text: "${text.length > 120 ? text.slice(0, 120) + "…" : text}"`);
  }
  if (typeof payload.name === "string") parts.push(`name: "${payload.name}"`);
  if (typeof payload.description === "string") {
    const desc = payload.description as string;
    parts.push(`desc: "${desc.length > 80 ? desc.slice(0, 80) + "…" : desc}"`);
  }
  if (Array.isArray(payload.labels) && payload.labels.length > 0) {
    parts.push(`labels: [${payload.labels.join(", ")}]`);
  }
  if (typeof payload.assigneeId === "string") parts.push(`assignee: ${payload.assigneeId}`);

  return parts.join(", ");
}

/**
 * Generate or update a rolling summary for an entity using an LLM.
 *
 * @param input - The entity context, events, and optional previous summary.
 * @returns The generated summary content and token usage.
 */
export async function generateSummary(
  input: SummaryGenerationInput,
): Promise<SummaryGenerationResult> {
  const adapter = aiService.getSystemAdapter(SUMMARY_MODEL);

  let userMessage: string;

  if (input.previousSummary) {
    userMessage = `Update the rolling summary for ${input.entityType} "${input.entityId}" with these new events.

Previous summary:
${input.previousSummary}

New events (${input.events.length}):
${formatEvents(input.events)}

Produce an updated summary that integrates the new events. Compress older details if needed to stay under 500 words.`;
  } else {
    userMessage = `Create a rolling summary for ${input.entityType} "${input.entityId}" from these events.

Events (${input.events.length}):
${formatEvents(input.events)}`;
  }

  const response = await adapter.complete({
    model: SUMMARY_MODEL,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1024,
    temperature: 0,
  });

  // Extract text content from response
  const content = response.content
    .filter((block) => block.type === "text")
    .map((block) => {
      if (block.type === "text") return block.text;
      return "";
    })
    .join("\n");

  return {
    content,
    usage: response.usage,
    model: response.model,
  };
}
