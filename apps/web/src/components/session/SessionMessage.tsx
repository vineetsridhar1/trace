import { asJsonObject, type JsonObject } from "@trace/shared";
import { useScopedEventField } from "../../stores/entity";
import { useEventScopeKey } from "./EventScopeContext";
import { UserBubble } from "./messages/UserBubble";
import { AssistantText } from "./messages/AssistantText";
import { ToolCallRow } from "./messages/ToolCallRow";
import { ToolResultRow } from "./messages/ToolResultRow";
import { SubagentRow } from "./messages/SubagentRow";
import { CompletionRow } from "./messages/CompletionRow";
import { SystemBadge } from "./messages/SystemBadge";
import { serializeUnknown } from "./messages/utils";
import type { AgentToolResult } from "./groupReadGlob";

const AGENT_NAMES = new Set(["agent", "task"]);

/** Safely read a string from an unknown value, returning fallback if not a string */
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Narrow unknown to the output type expected by ToolResultRow */
function asOutput(value: unknown): string | Record<string, unknown> | undefined {
  if (typeof value === "string") return value;
  return asJsonObject(value);
}

/** Serialize agent result content to a display string */
function agentResultToString(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (content != null && typeof content === "object") return serializeUnknown(content, 3000);
  return undefined;
}

/**
 * Render an assistant event. Adapters normalize all tool output into a
 * consistent schema: { type: "assistant", message: { content: MessageBlock[] } }
 */
function renderAssistantContent(
  payload: JsonObject,
  ts: string,
  completedAgentTools: Map<string, AgentToolResult>,
) {
  const message = asJsonObject(payload.message);
  const contentBlocks = message?.content;
  if (!Array.isArray(contentBlocks)) return null;

  const elements: React.ReactNode[] = [];
  for (let i = 0; i < contentBlocks.length; i++) {
    const block = asJsonObject(contentBlocks[i]);
    if (!block) continue;

    if (block.type === "text" && typeof block.text === "string") {
      elements.push(<AssistantText key={i} text={block.text} timestamp={ts} />);
    } else if (block.type === "tool_use") {
      const name = str(block.name, "Tool");
      if (AGENT_NAMES.has(name.toLowerCase())) {
        const input = asJsonObject(block.input);
        const toolUseId = str(block.id);
        const agentResult = toolUseId ? completedAgentTools.get(toolUseId) : undefined;
        elements.push(
          <SubagentRow
            key={i}
            description={str(input?.description) || str(input?.prompt) || "Subagent"}
            subagentType={str(input?.subagent_type, "agent")}
            isLoading={!agentResult}
            result={agentResult ? agentResultToString(agentResult.content) : undefined}
            timestamp={ts}
          />,
        );
      } else {
        elements.push(
          <ToolCallRow key={i} name={name} input={asJsonObject(block.input)} timestamp={ts} />,
        );
      }
    } else if (block.type === "tool_result") {
      // Agent/task tool_results are rendered inline in the SubagentRow of the
      // matching tool_use event — don't render them as standalone rows.
      if (AGENT_NAMES.has(str(block.name, "").toLowerCase())) continue;
      elements.push(
        <ToolResultRow
          key={i}
          name={str(block.name, "Tool")}
          output={asOutput(block.content ?? block.output)}
          timestamp={ts}
        />,
      );
    }
  }

  return elements.length > 0 ? <>{elements}</> : null;
}

function renderSessionOutput(
  payload: JsonObject,
  ts: string,
  completedAgentTools: Map<string, AgentToolResult>,
) {
  const type = payload.type;
  if (typeof type !== "string") return null;

  if (type === "assistant") {
    return renderAssistantContent(payload, ts, completedAgentTools);
  }

  if (type === "result") {
    return <CompletionRow timestamp={ts} />;
  }

  if (type === "error") {
    return <CompletionRow timestamp={ts} result={str(payload.message, "Error")} isUserStop />;
  }

  return null;
}

export function SessionMessage({
  id,
  completedAgentTools,
}: {
  id: string;
  completedAgentTools: Map<string, AgentToolResult>;
}) {
  const scopeKey = useEventScopeKey();
  const eventType = useScopedEventField(scopeKey, id, "eventType");
  const payload = asJsonObject(useScopedEventField(scopeKey, id, "payload"));
  const timestamp = useScopedEventField(scopeKey, id, "timestamp");
  const actor = useScopedEventField(scopeKey, id, "actor") as
    | { type: string; id: string; name?: string | null }
    | undefined;

  if (!eventType || !timestamp) return null;

  switch (eventType) {
    case "session_started":
      return typeof payload?.prompt === "string" ? (
        <UserBubble
          text={payload.prompt}
          timestamp={timestamp}
          actorId={actor?.id}
          actorName={actor?.name}
        />
      ) : (
        <SystemBadge text="Session started" />
      );

    case "session_output":
      return payload ? renderSessionOutput(payload, timestamp, completedAgentTools) : null;

    case "message_sent":
      return (
        <UserBubble
          text={str(payload?.text)}
          timestamp={timestamp}
          actorId={actor?.id}
          actorName={actor?.name}
        />
      );

    case "session_terminated": {
      if (payload?.reason === "bridge_complete") return null;
      if (payload?.reason === "workspace_failed") {
        const error = str(payload?.error);
        return <SystemBadge text={error || "Workspace preparation failed"} />;
      }
      if (payload?.status === "completed") {
        return <SystemBadge text="Session completed" />;
      }
      if (payload?.status === "failed") {
        return <SystemBadge text="Session failed" />;
      }
      return <SystemBadge text="Session terminated" />;
    }

    default:
      return null;
  }
}
