import { useEntityField } from "../../stores/entity";
import { UserBubble } from "./messages/UserBubble";
import { AssistantText } from "./messages/AssistantText";
import { ToolCallRow } from "./messages/ToolCallRow";
import { ToolResultRow } from "./messages/ToolResultRow";
import { SubagentRow } from "./messages/SubagentRow";
import { CompletionRow } from "./messages/CompletionRow";
import { SystemBadge } from "./messages/SystemBadge";

/** Types we skip rendering entirely */
const SKIP_TYPES = new Set(["system", "stderr", "rate_limit_event"]);

/** Safely read a string from an unknown value, returning fallback if not a string */
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Safely narrow unknown to a record for property access */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Narrow unknown to the output type expected by ToolResultRow */
function asOutput(value: unknown): string | Record<string, unknown> | undefined {
  if (typeof value === "string") return value;
  return asRecord(value);
}

function renderAssistantContent(payload: Record<string, unknown>, ts: string) {
  const message = asRecord(payload.message);
  const contentBlocks = message?.content;
  if (!Array.isArray(contentBlocks)) {
    const text = str(payload.text);
    return text ? <AssistantText text={text} timestamp={ts} /> : null;
  }

  const elements: React.ReactNode[] = [];
  for (let i = 0; i < contentBlocks.length; i++) {
    const block = asRecord(contentBlocks[i]);
    if (!block) continue;

    if (block.type === "text" && typeof block.text === "string") {
      elements.push(<AssistantText key={i} text={block.text} timestamp={ts} />);
    } else if (block.type === "tool_use") {
      const name = str(block.name, "Tool");
      // Check if it's a subagent
      if (name.toLowerCase() === "agent" || name.toLowerCase() === "task") {
        const input = asRecord(block.input);
        elements.push(
          <SubagentRow
            key={i}
            description={str(input?.description) || str(input?.prompt) || "Subagent"}
            subagentType={str(input?.subagent_type, "agent")}
            isLoading={true}
            timestamp={ts}
          />,
        );
      } else {
        elements.push(
          <ToolCallRow
            key={i}
            name={name}
            input={asRecord(block.input)}
            timestamp={ts}
          />,
        );
      }
    } else if (block.type === "tool_result") {
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

function renderSessionOutput(payload: Record<string, unknown>, ts: string) {
  const type = payload.type;
  if (typeof type !== "string" || SKIP_TYPES.has(type)) return null;

  if (type === "assistant" || type === "text") {
    return renderAssistantContent(payload, ts);
  }

  if (type === "tool_use") {
    const name = str(payload.name) || str(payload.tool) || "Tool";
    return <ToolCallRow name={name} input={asRecord(payload.input)} timestamp={ts} />;
  }

  if (type === "tool_result") {
    const name = str(payload.name) || str(payload.tool) || "Tool";
    return <ToolResultRow name={name} output={asOutput(payload.content ?? payload.output)} timestamp={ts} />;
  }

  if (type === "result") {
    if ("exitCode" in payload) return null;
    return <CompletionRow timestamp={ts} />;
  }

  if (type === "error") {
    return <CompletionRow timestamp={ts} result={str(payload.message, "Error")} isUserStop />;
  }

  // Fallback for unknown types with text content
  const fallback = payload.text ?? payload.content ?? payload.message;
  if (typeof fallback === "string" && fallback) {
    return <AssistantText text={fallback} timestamp={ts} />;
  }

  return null;
}

export function SessionMessage({ id }: { id: string }) {
  const eventType = useEntityField("events", id, "eventType");
  const payload = useEntityField("events", id, "payload");
  const timestamp = useEntityField("events", id, "timestamp");

  if (!eventType || !timestamp) return null;

  switch (eventType) {
    case "session_started":
      return typeof payload?.prompt === "string"
        ? <UserBubble text={payload.prompt} timestamp={timestamp} />
        : <SystemBadge text="Session started" />;

    case "session_output":
      return payload ? renderSessionOutput(payload, timestamp) : null;

    case "message_sent":
      return <UserBubble text={str(payload?.text)} timestamp={timestamp} />;

    case "session_terminated": {
      const isManualStop = payload?.reason !== "bridge_complete";
      return isManualStop ? <SystemBadge text="Session terminated" /> : null;
    }

    default:
      return null;
  }
}
