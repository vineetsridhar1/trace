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

function renderAssistantContent(payload: Record<string, any>, ts: string) {
  const contentBlocks = payload?.message?.content as Array<Record<string, any>> | undefined;
  if (!contentBlocks || !Array.isArray(contentBlocks)) {
    const text = payload?.text ?? "";
    return text ? <AssistantText text={text} timestamp={ts} /> : null;
  }

  const elements: React.ReactNode[] = [];
  for (let i = 0; i < contentBlocks.length; i++) {
    const block = contentBlocks[i];
    if (block.type === "text" && block.text) {
      elements.push(<AssistantText key={i} text={block.text} timestamp={ts} />);
    } else if (block.type === "tool_use") {
      const name = block.name ?? "Tool";
      // Check if it's a subagent
      if (name.toLowerCase() === "agent" || name.toLowerCase() === "task") {
        const input = block.input as Record<string, any> | undefined;
        elements.push(
          <SubagentRow
            key={i}
            description={input?.description ?? input?.prompt ?? "Subagent"}
            subagentType={input?.subagent_type ?? "agent"}
            isLoading={true}
            timestamp={ts}
          />,
        );
      } else {
        elements.push(
          <ToolCallRow
            key={i}
            name={name}
            input={block.input as Record<string, unknown> | undefined}
            timestamp={ts}
          />,
        );
      }
    } else if (block.type === "tool_result") {
      elements.push(
        <ToolResultRow
          key={i}
          name={block.name ?? "Tool"}
          output={block.content ?? block.output}
          timestamp={ts}
        />,
      );
    }
  }

  return elements.length > 0 ? <>{elements}</> : null;
}

function renderSessionOutput(payload: Record<string, any>, ts: string) {
  const type = payload?.type;
  if (!type || SKIP_TYPES.has(type)) return null;

  if (type === "assistant" || type === "text") {
    return renderAssistantContent(payload, ts);
  }

  if (type === "tool_use") {
    const name = payload?.name ?? payload?.tool ?? "Tool";
    return <ToolCallRow name={name} input={payload?.input} timestamp={ts} />;
  }

  if (type === "tool_result") {
    const name = payload?.name ?? payload?.tool ?? "Tool";
    return <ToolResultRow name={name} output={payload?.content ?? payload?.output} timestamp={ts} />;
  }

  if (type === "result") {
    if ("exitCode" in (payload ?? {})) return null;
    return <CompletionRow timestamp={ts} result={payload?.result} />;
  }

  if (type === "error") {
    return <CompletionRow timestamp={ts} result={payload?.message ?? "Error"} isUserStop />;
  }

  // Fallback for unknown types with text content
  const fallback = payload?.text ?? payload?.content ?? payload?.message;
  if (typeof fallback === "string" && fallback) {
    return <AssistantText text={fallback} timestamp={ts} />;
  }

  return null;
}

export function SessionMessage({ id }: { id: string }) {
  const eventType = useEntityField("events", id, "eventType") as string | undefined;
  const payload = useEntityField("events", id, "payload") as Record<string, any> | undefined;
  const timestamp = useEntityField("events", id, "timestamp") as string | undefined;

  if (!eventType || !timestamp) return null;

  switch (eventType) {
    case "session_started":
      return payload?.prompt
        ? <UserBubble text={payload.prompt} timestamp={timestamp} />
        : <SystemBadge text="Session started" />;

    case "session_output":
      return payload ? renderSessionOutput(payload, timestamp) : null;

    case "message_sent":
      return <UserBubble text={payload?.text ?? ""} timestamp={timestamp} />;

    case "session_terminated":
      return <SystemBadge text="Session terminated" />;

    default:
      return null;
  }
}
