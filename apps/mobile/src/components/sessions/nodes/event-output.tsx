import { Fragment, type ReactNode } from "react";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { AssistantMessage } from "./AssistantMessage";
import { CompletionRow } from "./CompletionRow";
import { SubagentRow } from "./SubagentRow";
import { ToolCallRow } from "./ToolCallRow";
import { serializeUnknown } from "./utils";
import type { NodeRenderContext } from "./render-context";

const AGENT_NAMES = new Set(["agent", "task"]);

/** Dispatch the block array inside an assistant/user session_output payload. */
export function renderSessionOutput(
  payload: JsonObject,
  context: NodeRenderContext,
  isLast: boolean,
): ReactNode {
  const type = payload.type;
  if (type === "assistant" || type === "user") {
    return renderAssistantContent(payload, context, isLast);
  }
  if (type === "result") return <CompletionRow />;
  if (type === "error") {
    const message = typeof payload.message === "string" ? payload.message : "Error";
    return <CompletionRow result={message} isUserStop />;
  }
  return null;
}

function renderAssistantContent(
  payload: JsonObject,
  context: NodeRenderContext,
  isLast: boolean,
): ReactNode {
  const message = asJsonObject(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return null;

  // Find the last non-empty text block — the streaming cursor attaches there.
  let lastTextIndex = -1;
  for (let i = 0; i < blocks.length; i++) {
    const block = asJsonObject(blocks[i]);
    if (!block) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      lastTextIndex = i;
    }
  }

  const rendered: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = asJsonObject(blocks[i]);
    if (!block) continue;

    if (block.type === "text" && typeof block.text === "string") {
      if (!block.text.trim()) continue;
      rendered.push(
        <AssistantMessage
          key={i}
          text={block.text}
          streaming={isLast && context.sessionActive && i === lastTextIndex}
        />,
      );
      continue;
    }

    if (block.type === "tool_use") {
      const name = typeof block.name === "string" ? block.name : "Tool";
      const toolUseId = typeof block.id === "string" ? block.id : undefined;
      if (AGENT_NAMES.has(name.toLowerCase())) {
        const input = asJsonObject(block.input);
        const agentResult = toolUseId ? context.completedAgentTools.get(toolUseId) : undefined;
        rendered.push(
          <SubagentRow
            key={i}
            description={asStr(input?.description) || asStr(input?.prompt) || "Subagent"}
            subagentType={asStr(input?.subagent_type) || "agent"}
            isLoading={!agentResult}
            result={agentResult ? agentResultToString(agentResult.content) : undefined}
          />,
        );
      } else {
        const rawOutput = toolUseId ? context.toolResultByUseId.get(toolUseId) : undefined;
        rendered.push(
          <ToolCallRow
            key={i}
            name={name}
            input={asJsonObject(block.input)}
            output={asOutput(rawOutput)}
          />,
        );
      }
      continue;
    }
    // tool_result blocks render inline inside ToolCallRow — skip at the top level.
  }

  if (rendered.length === 0) return null;
  return <Fragment>{rendered}</Fragment>;
}

function asStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function agentResultToString(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (content != null && typeof content === "object") return serializeUnknown(content, 3000);
  return undefined;
}

function asOutput(value: unknown): string | Record<string, unknown> | undefined {
  if (typeof value === "string") return value;
  const obj = asJsonObject(value);
  if (!obj) return undefined;
  if ("output" in obj) {
    const nested = obj.output;
    if (typeof nested === "string") return nested;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
    return undefined;
  }
  return obj;
}
