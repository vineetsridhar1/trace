import { useEntityField } from "../../stores/entity";
import { UserBubble } from "./messages/UserBubble";
import { AssistantText } from "./messages/AssistantText";
import { ToolCallRow } from "./messages/ToolCallRow";
import { ToolResultRow } from "./messages/ToolResultRow";
import { SubagentRow } from "./messages/SubagentRow";
import { CompletionRow } from "./messages/CompletionRow";
import { SystemBadge } from "./messages/SystemBadge";

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

/**
 * Render an assistant event. Adapters normalize all tool output into a
 * consistent schema: { type: "assistant", message: { content: MessageBlock[] } }
 */
function renderAssistantContent(payload: Record<string, unknown>, ts: string) {
  const message = asRecord(payload.message);
  const contentBlocks = message?.content;
  if (!Array.isArray(contentBlocks)) return null;

  const elements: React.ReactNode[] = [];
  for (let i = 0; i < contentBlocks.length; i++) {
    const block = asRecord(contentBlocks[i]);
    if (!block) continue;

    if (block.type === "text" && typeof block.text === "string") {
      elements.push(<AssistantText key={i} text={block.text} timestamp={ts} />);
    } else if (block.type === "tool_use") {
      const name = str(block.name, "Tool");
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
  if (typeof type !== "string") return null;

  if (type === "assistant") {
    return renderAssistantContent(payload, ts);
  }

  if (type === "result") {
    return <CompletionRow timestamp={ts} />;
  }

  if (type === "error") {
    return <CompletionRow timestamp={ts} result={str(payload.message, "Error")} isUserStop />;
  }

  return null;
}

export function SessionMessage({ id }: { id: string }) {
  const eventType = useEntityField("events", id, "eventType");
  const payload = useEntityField("events", id, "payload");
  const timestamp = useEntityField("events", id, "timestamp");
  const actor = useEntityField("events", id, "actor") as { type: string; id: string; name?: string | null } | undefined;

  if (!eventType || !timestamp) return null;

  switch (eventType) {
    case "session_started":
      return typeof payload?.prompt === "string"
        ? <UserBubble text={payload.prompt} timestamp={timestamp} actorId={actor?.id} actorName={actor?.name} />
        : <SystemBadge text="Session started" />;

    case "session_output":
      return payload ? renderSessionOutput(payload, timestamp) : null;

    case "message_sent":
      return <UserBubble text={str(payload?.text)} timestamp={timestamp} actorId={actor?.id} actorName={actor?.name} />;

    case "session_terminated": {
      const isManualStop = payload?.reason !== "bridge_complete";
      return isManualStop ? <SystemBadge text="Session terminated" /> : null;
    }

    default:
      return null;
  }
}
