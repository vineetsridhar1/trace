/**
 * Stream Reply — generates the agent's DM/@mention reply via a streaming LLM
 * call and publishes text deltas to the client in real time.
 *
 * This is the "pass 2" in the two-pass approach:
 *   Pass 1 (planner): non-streaming, structured decision → "I should reply"
 *   Pass 2 (streamer): streaming text generation → tokens flow to the client
 *
 * The planner's original message text is replaced by the streamed output so
 * the user sees a coherent single response.
 */

import type { LLMAdapter } from "@trace/shared";
import type { AgentContextPacket } from "./context-builder.js";
import type { ProposedAction } from "./planner.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { createLLMAdapter } from "../lib/llm/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamReplyOptions {
  /** The context packet from the pipeline. */
  packet: AgentContextPacket;
  /** The planner's proposed message action (message.send or message.sendToChannel). */
  action: ProposedAction;
  /** The agent's user ID (for actor attribution in stream events). */
  agentId: string;
  /** Model to use (same tier as the planner). */
  model: string;
  /** Optional adapter override (for testing). */
  adapter?: LLMAdapter;
}

export interface StreamReplyResult {
  /** The complete streamed text, ready to replace action.args.text. */
  text: string;
}

// ---------------------------------------------------------------------------
// Adapter (reuses the planner's cached adapter)
// ---------------------------------------------------------------------------

let cachedAdapter: LLMAdapter | null = null;

function getAdapter(): LLMAdapter {
  if (cachedAdapter) return cachedAdapter;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY env var is required for stream-reply");
  }

  cachedAdapter = createLLMAdapter({ provider: "anthropic", apiKey });
  return cachedAdapter;
}

// ---------------------------------------------------------------------------
// System prompt — focused on generating a reply, no structured tool output
// ---------------------------------------------------------------------------

function buildStreamPrompt(packet: AgentContextPacket, action: ProposedAction): string {
  const parts: string[] = [];

  parts.push(
    `You are an AI assistant responding in a ${packet.isDm ? "direct message" : "group conversation"} on a project management platform called Trace.`,
  );

  // Include soul file if available
  if (packet.soulFile) {
    parts.push(`<personality>\n${packet.soulFile}\n</personality>`);
  }

  // Include the planner's rationale as guidance
  const plannerText = action.args.text as string | undefined;
  if (plannerText) {
    parts.push(
      `<planner_draft>\nA planner decided you should reply with approximately this message:\n${plannerText}\n</planner_draft>\n\n` +
      `Use the planner's draft as guidance for content and intent, but generate your own natural response. ` +
      `You may rephrase, expand slightly, or improve clarity — but stay faithful to the intent and keep it concise.`,
    );
  }

  // Conversation context — recent events give the LLM enough context to reply coherently
  if (packet.recentEvents.length > 0) {
    parts.push(
      `<recent_messages>\n${JSON.stringify(packet.recentEvents, null, 2)}\n</recent_messages>`,
    );
  }

  // Actors
  if (packet.actors.length > 0) {
    const actorStr = packet.actors
      .map((a) => `  ${a.name} (${a.type}, ${a.role}) — ${a.id}`)
      .join("\n");
    parts.push(`<actors>\n${actorStr}\n</actors>`);
  }

  // Relevant entities for richer context
  if (packet.relevantEntities.length > 0) {
    const entityStr = packet.relevantEntities
      .slice(0, 5) // limit to top-5 for the streamer prompt
      .map((e) => `  [${e.type}:${e.id}] ${JSON.stringify(e.data)}`)
      .join("\n");
    parts.push(`<relevant_context>\n${entityStr}\n</relevant_context>`);
  }

  parts.push(
    "Reply directly. Do not include any preamble, tool calls, or JSON. " +
    "Just output the message text the user will see. Be concise and helpful.",
  );

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Stream the agent's reply text via the LLM and publish TEXT_DELTA events
 * to the client in real time. Returns the accumulated full text.
 *
 * Publishes to `topics.chatStream(chatId)` so the frontend can render
 * a streaming ghost message.
 */
export async function streamAgentReply(options: StreamReplyOptions): Promise<StreamReplyResult> {
  const { packet, action, agentId, model, adapter: adapterOverride } = options;
  const adapter = adapterOverride ?? getAdapter();

  const chatId = (action.args.chatId ?? packet.scopeId) as string;
  const systemPrompt = buildStreamPrompt(packet, action);

  let fullText = "";

  try {
    for await (const event of adapter.stream({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: "Generate your reply now." }],
      maxTokens: 1024,
      temperature: 0.3,
    })) {
      if (event.type === "text_delta") {
        fullText += event.text;
        pubsub.publish(topics.chatStream(chatId), {
          chatStream: {
            chatId,
            actorId: agentId,
            type: "TEXT_DELTA",
            text: event.text,
          },
        });
      }

      if (event.type === "error") {
        throw event.error;
      }
    }
  } catch (err) {
    // If streaming fails and we have partial text, still return what we have.
    // If we have nothing, rethrow so the pipeline can fall back to the planner's text.
    if (!fullText) throw err;
    console.error("[stream-reply] stream error after partial output:", err);
  }

  return { text: fullText || ((action.args.text as string) ?? "") };
}
