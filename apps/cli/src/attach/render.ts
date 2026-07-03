import type { Event } from "@trace/gql";
import {
  buildSessionNodes,
  stripPromptWrapping,
  type SessionNode,
} from "@trace/client-core/headless";
import { asJsonObject, hasVisibleUserSessionContent } from "@trace/shared";

const PROMPT_PREFIX = "you > ";
const PROMPT_CONTINUATION = "      ";

function promptLines(text: string): string[] {
  const cleaned = stripPromptWrapping(text);
  if (!cleaned) return [];
  return cleaned
    .split("\n")
    .map((line, index) =>
      index === 0 ? `${PROMPT_PREFIX}${line}` : `${PROMPT_CONTINUATION}${line}`,
    );
}

function summarizeToolInput(input: unknown): string {
  const record = asJsonObject(input);
  if (!record) return "";
  for (const key of ["file_path", "path", "command", "pattern", "query", "url"]) {
    if (typeof record[key] === "string") return record[key];
  }
  const serialized = JSON.stringify(record);
  return serialized.length > 80 ? `${serialized.slice(0, 77)}...` : serialized;
}

function assistantOutputLines(payload: Record<string, unknown>): string[] {
  const message = asJsonObject(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return [];
  const lines: string[] = [];
  for (const raw of blocks) {
    const block = asJsonObject(raw);
    if (!block) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      lines.push(...block.text.trimEnd().split("\n"));
    }
    if (block.type === "tool_use" && typeof block.name === "string") {
      const summary = summarizeToolInput(block.input);
      lines.push(`[tool] ${block.name}${summary ? ` ${summary}` : ""}`);
    }
  }
  return lines;
}

function eventLines(event: Event): string[] {
  if (event.eventType === "session_started" || event.eventType === "message_sent") {
    if (!hasVisibleUserSessionContent(event.eventType, event.payload)) return [];
    const payload = asJsonObject(event.payload);
    return typeof payload?.text === "string" ? promptLines(payload.text) : [];
  }
  if (
    event.eventType === "session_pr_opened" ||
    event.eventType === "session_pr_merged" ||
    event.eventType === "session_pr_closed"
  ) {
    const payload = asJsonObject(event.payload);
    const url = typeof payload?.url === "string" ? ` ${payload.url}` : "";
    return [`[pr] ${event.eventType.replace("session_pr_", "")}${url}`];
  }
  if (event.eventType !== "session_output") return [];

  const payload = asJsonObject(event.payload);
  if (!payload) return [];
  if (payload.type === "assistant") return assistantOutputLines(payload);
  if (payload.type === "error") {
    const message = typeof payload.message === "string" ? payload.message : "unknown error";
    return [`[error] ${message}`];
  }
  return [];
}

function nodeLines(node: SessionNode, events: Record<string, Event>): string[] {
  switch (node.kind) {
    case "event": {
      const event = events[node.id];
      return event ? eventLines(event) : [];
    }
    case "command-execution": {
      const exit = node.exitCode !== undefined ? ` (exit ${node.exitCode})` : "";
      return [`$ ${node.command}${exit}`];
    }
    case "readglob-group":
      // One line per item so a growing group appends instead of rewriting.
      return node.items.map((item) => `[${item.toolName.toLowerCase()}] ${item.filePath}`);
    case "plan-review": {
      const header = `[plan] ${node.planFilePath}`;
      const body = node.planContent
        .trimEnd()
        .split("\n")
        .map((line) => `  ${line}`);
      return [header, ...body];
    }
    case "ask-user-question": {
      const lines: string[] = [];
      for (const question of node.questions) {
        lines.push(`[question] ${question.question}`);
        question.options.forEach((option, index) => {
          lines.push(`  (${index + 1}) ${option.label}`);
        });
      }
      return lines;
    }
  }
}

/** Pure transcript renderer: ordered events in, plain lines out. */
export function renderTranscriptLines(eventIds: string[], events: Record<string, Event>): string[] {
  const { nodes } = buildSessionNodes(eventIds, events);
  const lines: string[] = [];
  for (const node of nodes) {
    const rendered = nodeLines(node, events);
    if (rendered.length > 0) {
      lines.push(...rendered);
    }
  }
  return lines;
}

/** Lines to append given the previously printed transcript — append-only output. */
export function appendDelta(previous: string[], next: string[]): string[] {
  let divergence = 0;
  while (
    divergence < previous.length &&
    divergence < next.length &&
    previous[divergence] === next[divergence]
  ) {
    divergence += 1;
  }
  return next.slice(divergence);
}
