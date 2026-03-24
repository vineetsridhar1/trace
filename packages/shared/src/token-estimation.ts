import { asJsonObject } from "./json.js";

const CHARS_PER_TOKEN = 4;

export function estimateTextTokens(text: string | null | undefined): number {
  if (typeof text !== "string") return 0;
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.ceil(normalized.length / CHARS_PER_TOKEN);
}

function estimateValueTokens(value: unknown): number {
  if (typeof value === "string") return estimateTextTokens(value);
  if (value == null) return 0;
  try {
    return estimateTextTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function estimateAssistantPayloadTokens(payload: Record<string, unknown>): number {
  const message = asJsonObject(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) return 0;

  let total = 0;
  for (const rawBlock of content) {
    const block = asJsonObject(rawBlock);
    if (!block) continue;

    switch (block.type) {
      case "text":
        total += estimateTextTokens(typeof block.text === "string" ? block.text : "");
        break;
      case "tool_use":
        total += estimateTextTokens(typeof block.name === "string" ? block.name : "");
        total += estimateValueTokens(block.input);
        break;
      case "tool_result":
        total += estimateTextTokens(typeof block.name === "string" ? block.name : "");
        total += estimateValueTokens(block.content);
        break;
      case "plan":
        total += estimateTextTokens(typeof block.content === "string" ? block.content : "");
        total += estimateTextTokens(typeof block.filePath === "string" ? block.filePath : "");
        break;
      case "question":
        total += estimateValueTokens(block.questions);
        break;
      default:
        total += estimateValueTokens(block);
    }
  }

  return total;
}

export function estimateSessionEventTokens(eventType: string, payload: unknown): number {
  const data = asJsonObject(payload);
  if (!data) return 0;

  switch (eventType) {
    case "session_started":
      return estimateTextTokens(typeof data.prompt === "string" ? data.prompt : "");
    case "message_sent":
      return estimateTextTokens(typeof data.text === "string" ? data.text : "");
    case "session_output":
      if (data.type === "assistant") {
        return estimateAssistantPayloadTokens(data);
      }
      if (data.type === "error") {
        return estimateTextTokens(typeof data.message === "string" ? data.message : "");
      }
      return 0;
    default:
      return 0;
  }
}
