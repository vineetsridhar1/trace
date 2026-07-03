import type { Event } from "@trace/gql";
import {
  buildSessionNodes,
  isOptimisticEvent,
  stripPromptWrapping,
  type SessionNode,
} from "@trace/client-core/headless";
import { asJsonObject, hasVisibleUserSessionContent, type Question } from "@trace/shared";

/**
 * Render-ready nodes that cross the daemon RPC boundary. Editors render these
 * kinds and never see raw events — if a renderer needs more data, extend the
 * shared node-building path, not the editor.
 */
export type ProtocolNode =
  | { id: string; kind: "user_prompt"; text: string; timestamp: string; optimistic: boolean }
  | { id: string; kind: "agent_text"; text: string; timestamp: string }
  | { id: string; kind: "tool_use"; name: string; summary: string; timestamp: string }
  | {
      id: string;
      kind: "command";
      command: string;
      output: string | null;
      exitCode: number | null;
      timestamp: string;
    }
  | {
      id: string;
      kind: "read_group";
      items: Array<{ toolName: string; filePath: string }>;
      timestamp: string;
    }
  | { id: string; kind: "plan"; content: string; filePath: string; timestamp: string }
  | { id: string; kind: "question"; questions: Question[]; timestamp: string }
  | { id: string; kind: "pr"; action: string; url: string | null; timestamp: string }
  | { id: string; kind: "error"; message: string; timestamp: string };

function summarizeToolInput(input: unknown): string {
  const record = asJsonObject(input);
  if (!record) return "";
  for (const key of ["file_path", "path", "command", "pattern", "query", "url"]) {
    if (typeof record[key] === "string") return record[key];
  }
  const serialized = JSON.stringify(record);
  return serialized.length > 80 ? `${serialized.slice(0, 77)}...` : serialized;
}

function eventProtocolNodes(event: Event): ProtocolNode[] {
  if (event.eventType === "session_started" || event.eventType === "message_sent") {
    if (!hasVisibleUserSessionContent(event.eventType, event.payload)) return [];
    const payload = asJsonObject(event.payload);
    if (typeof payload?.text !== "string") return [];
    const text = stripPromptWrapping(payload.text);
    if (!text) return [];
    return [
      {
        id: event.id,
        kind: "user_prompt",
        text,
        timestamp: event.timestamp,
        optimistic: isOptimisticEvent(event.id),
      },
    ];
  }

  if (
    event.eventType === "session_pr_opened" ||
    event.eventType === "session_pr_merged" ||
    event.eventType === "session_pr_closed"
  ) {
    const payload = asJsonObject(event.payload);
    return [
      {
        id: event.id,
        kind: "pr",
        action: event.eventType.replace("session_pr_", ""),
        url: typeof payload?.url === "string" ? payload.url : null,
        timestamp: event.timestamp,
      },
    ];
  }

  if (event.eventType !== "session_output") return [];
  const payload = asJsonObject(event.payload);
  if (!payload) return [];

  if (payload.type === "error") {
    return [
      {
        id: event.id,
        kind: "error",
        message: typeof payload.message === "string" ? payload.message : "unknown error",
        timestamp: event.timestamp,
      },
    ];
  }

  if (payload.type !== "assistant") return [];
  const message = asJsonObject(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return [];

  const nodes: ProtocolNode[] = [];
  blocks.forEach((raw, index) => {
    const block = asJsonObject(raw);
    if (!block) return;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      nodes.push({
        id: `${event.id}:${index}`,
        kind: "agent_text",
        text: block.text.trimEnd(),
        timestamp: event.timestamp,
      });
    }
    if (block.type === "tool_use" && typeof block.name === "string") {
      nodes.push({
        id: `${event.id}:${index}`,
        kind: "tool_use",
        name: block.name,
        summary: summarizeToolInput(block.input),
        timestamp: event.timestamp,
      });
    }
  });
  return nodes;
}

function sessionNodeToProtocol(node: SessionNode, events: Record<string, Event>): ProtocolNode[] {
  switch (node.kind) {
    case "event": {
      const event = events[node.id];
      return event ? eventProtocolNodes(event) : [];
    }
    case "command-execution":
      return [
        {
          id: node.id,
          kind: "command",
          command: node.command,
          output: typeof node.output === "string" ? node.output : null,
          exitCode: node.exitCode ?? null,
          timestamp: node.timestamp,
        },
      ];
    case "readglob-group": {
      const first = node.items[0];
      return [
        {
          id: first ? `group:${first.id}` : "group:empty",
          kind: "read_group",
          items: node.items.map((item) => ({ toolName: item.toolName, filePath: item.filePath })),
          timestamp: first?.timestamp ?? "",
        },
      ];
    }
    case "plan-review":
      return [
        {
          id: node.id,
          kind: "plan",
          content: node.planContent,
          filePath: node.planFilePath,
          timestamp: node.timestamp,
        },
      ];
    case "ask-user-question":
      return [
        {
          id: node.id,
          kind: "question",
          questions: node.questions,
          timestamp: node.timestamp,
        },
      ];
  }
}

/** Full pipeline: ordered scoped events → client-core session nodes → protocol nodes. */
export function toProtocolNodes(eventIds: string[], events: Record<string, Event>): ProtocolNode[] {
  const { nodes } = buildSessionNodes(eventIds, events);
  return nodes.flatMap((node) => sessionNodeToProtocol(node, events));
}
