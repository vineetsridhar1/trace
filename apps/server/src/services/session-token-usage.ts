import {
  asJsonObject,
  estimateSessionEventTokens,
  estimateTextTokens,
  getModelContextWindowTokens,
} from "@trace/shared";
import { prisma } from "../lib/db.js";

const SESSION_CONTEXT_EVENT_TYPES = ["session_started", "message_sent", "session_output"] as const;

type SessionContextEvent = {
  eventType: (typeof SESSION_CONTEXT_EVENT_TYPES)[number];
  payload: unknown;
};

export interface SessionContextMetrics {
  estimatedContextTokens: number;
  modelContextWindowTokens: number | null;
  contextWindowUtilization: number | null;
}

function estimateReplayEventTokens(event: SessionContextEvent): number {
  const payload = asJsonObject(event.payload);
  if (!payload) return 0;

  if (event.eventType === "session_started") {
    return estimateTextTokens(typeof payload.prompt === "string" ? payload.prompt : "");
  }

  if (event.eventType === "message_sent") {
    return estimateTextTokens(typeof payload.text === "string" ? payload.text : "");
  }

  if (event.eventType !== "session_output" || payload.type !== "assistant") {
    return 0;
  }

  const message = asJsonObject(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) return 0;

  let total = 0;
  for (const rawBlock of content) {
    const block = asJsonObject(rawBlock);
    if (block?.type === "text" && typeof block.text === "string") {
      total += estimateTextTokens(block.text);
    }
  }
  return total;
}

async function loadSessionContextEvents(sessionId: string): Promise<SessionContextEvent[]> {
  const events = await prisma.event.findMany({
    where: {
      scopeId: sessionId,
      scopeType: "session",
      eventType: { in: [...SESSION_CONTEXT_EVENT_TYPES] },
    },
    orderBy: { timestamp: "asc" },
    select: { eventType: true, payload: true },
  });

  return events.map((event) => ({
    eventType: event.eventType as SessionContextEvent["eventType"],
    payload: event.payload,
  }));
}

async function estimateReplayContextTokens(
  sessionId: string,
  visited: Set<string>,
): Promise<number> {
  if (visited.has(sessionId)) return 0;
  visited.add(sessionId);

  const events = await loadSessionContextEvents(sessionId);
  let total = 0;
  let sourceSessionId: string | null = null;
  let hasEmbeddedPrompt = false;

  for (const event of events) {
    total += estimateReplayEventTokens(event);

    if (event.eventType === "session_started") {
      const payload = asJsonObject(event.payload);
      hasEmbeddedPrompt = typeof payload?.prompt === "string" && payload.prompt.length > 0;
      sourceSessionId =
        typeof payload?.sourceSessionId === "string" ? payload.sourceSessionId : null;
    }
  }

  if (!hasEmbeddedPrompt && sourceSessionId) {
    total += await estimateReplayContextTokens(sourceSessionId, visited);
  }

  return total;
}

async function estimateSessionContextTokens(
  sessionId: string,
  visited: Set<string>,
): Promise<number> {
  if (visited.has(sessionId)) return 0;
  visited.add(sessionId);

  const events = await loadSessionContextEvents(sessionId);
  let total = 0;
  let sourceSessionId: string | null = null;
  let hasEmbeddedPrompt = false;

  for (const event of events) {
    total += estimateSessionEventTokens(event.eventType, event.payload);

    if (event.eventType === "session_started") {
      const payload = asJsonObject(event.payload);
      hasEmbeddedPrompt = typeof payload?.prompt === "string" && payload.prompt.length > 0;
      sourceSessionId =
        typeof payload?.sourceSessionId === "string" ? payload.sourceSessionId : null;
    }
  }

  // Sessions forked from history can inherit a large replay prompt even when the
  // start event itself has no prompt. Include the source replay estimate so the
  // badge reflects the actual handoff size more closely.
  if (!hasEmbeddedPrompt && sourceSessionId) {
    total += await estimateReplayContextTokens(sourceSessionId, visited);
  }

  return total;
}

export async function getSessionContextMetrics(input: {
  sessionId: string;
  model: string | null | undefined;
}): Promise<SessionContextMetrics> {
  const estimatedContextTokens = await estimateSessionContextTokens(
    input.sessionId,
    new Set<string>(),
  );
  const modelContextWindowTokens =
    input.model != null ? getModelContextWindowTokens(input.model) : null;

  return {
    estimatedContextTokens,
    modelContextWindowTokens,
    contextWindowUtilization:
      modelContextWindowTokens && modelContextWindowTokens > 0
        ? estimatedContextTokens / modelContextWindowTokens
        : null,
  };
}
