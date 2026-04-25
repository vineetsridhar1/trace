import { memo } from "react";
import type { GitCheckpoint } from "@trace/gql";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { useScopedEventField } from "@trace/client-core";
import { useEventScopeKey } from "./EventScopeContext";
import { UserBubble } from "./messages/UserBubble";
import { AssistantText } from "./messages/AssistantText";
import { ToolCallRow } from "./messages/ToolCallRow";
import { SubagentRow } from "./messages/SubagentRow";
import { CompletionRow } from "./messages/CompletionRow";
import { SystemBadge } from "./messages/SystemBadge";
import { GitCheckpointChips } from "./messages/GitCheckpointChips";
import { serializeUnknown } from "./messages/utils";
import type { AgentToolResult } from "./groupReadGlob";

const AGENT_NAMES = new Set(["agent", "task"]);

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((v) => typeof v === "string") ? value : undefined;
}

/** Safely read a string from an unknown value, returning fallback if not a string */
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Narrow and unwrap tool result content for display in ToolCallRow */
function asOutput(value: unknown): string | Record<string, unknown> | undefined {
  if (typeof value === "string") return value;
  const obj = asJsonObject(value);
  if (!obj) return undefined;
  // Unwrap nested { output: ... } envelope that some adapters produce
  if ("output" in obj) {
    const nested = obj.output;
    if (typeof nested === "string") return nested;
    if (nested && typeof nested === "object" && !Array.isArray(nested))
      return nested as Record<string, unknown>;
    return undefined;
  }
  return obj;
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
  scopeKey: string,
  completedAgentTools: Map<string, AgentToolResult>,
  toolResultByUseId: Map<string, unknown>,
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>,
) {
  const message = asJsonObject(payload.message);
  const contentBlocks = message?.content;
  if (!Array.isArray(contentBlocks)) return null;

  const elements: React.ReactNode[] = [];
  for (let i = 0; i < contentBlocks.length; i++) {
    const block = asJsonObject(contentBlocks[i]);
    if (!block) continue;

    if (block.type === "text" && typeof block.text === "string") {
      if (!block.text.trim()) continue;
      elements.push(<AssistantText key={i} text={block.text} timestamp={ts} />);
    } else if (block.type === "tool_use") {
      const name = str(block.name, "Tool");
      const toolUseId = typeof block.id === "string" ? block.id : undefined;
      if (AGENT_NAMES.has(name.toLowerCase())) {
        const input = asJsonObject(block.input);
        const agentResult = toolUseId ? completedAgentTools.get(toolUseId) : undefined;
        elements.push(
          <SubagentRow
            key={i}
            description={str(input?.description) || str(input?.prompt) || "Subagent"}
            subagentType={str(input?.subagent_type, "agent")}
            isLoading={!agentResult}
            result={agentResult ? agentResultToString(agentResult.content) : undefined}
            timestamp={ts}
            toolUseId={toolUseId}
            scopeKey={scopeKey}
            completedAgentTools={completedAgentTools}
            toolResultByUseId={toolResultByUseId}
            gitCheckpointsByPromptEventId={gitCheckpointsByPromptEventId}
          />,
        );
      } else {
        const rawOutput = toolUseId ? toolResultByUseId.get(toolUseId) : undefined;
        elements.push(
          <ToolCallRow
            key={i}
            name={name}
            input={asJsonObject(block.input)}
            output={asOutput(rawOutput)}
            timestamp={ts}
          />,
        );
      }
    } else if (block.type === "tool_result") {
      // Results are rendered inline inside the matching ToolCallRow — skip standalone rows.
    }
  }

  return elements.length > 0 ? <>{elements}</> : null;
}

function renderSessionOutput(
  payload: JsonObject,
  ts: string,
  scopeKey: string,
  completedAgentTools: Map<string, AgentToolResult>,
  toolResultByUseId: Map<string, unknown>,
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>,
) {
  const type = payload.type;
  if (typeof type !== "string") return null;

  if (type === "assistant" || type === "user") {
    return renderAssistantContent(
      payload,
      ts,
      scopeKey,
      completedAgentTools,
      toolResultByUseId,
      gitCheckpointsByPromptEventId,
    );
  }

  if (type === "result") {
    return <CompletionRow timestamp={ts} />;
  }

  if (type === "error") {
    return <CompletionRow timestamp={ts} result={str(payload.message, "Error")} isUserStop />;
  }

  return null;
}

export const SessionMessage = memo(function SessionMessage({
  id,
  gitCheckpointsByPromptEventId,
  completedAgentTools,
  toolResultByUseId,
}: {
  id: string;
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>;
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
}) {
  const scopeKey = useEventScopeKey();
  const eventType = useScopedEventField(scopeKey, id, "eventType");
  const payload = asJsonObject(useScopedEventField(scopeKey, id, "payload"));
  const timestamp = useScopedEventField(scopeKey, id, "timestamp");
  const actor = useScopedEventField(scopeKey, id, "actor") as
    | { type: string; id: string; name?: string | null }
    | undefined;
  const promptGitCheckpoints = gitCheckpointsByPromptEventId.get(id) ?? [];

  if (!eventType || !timestamp) return null;

  switch (eventType) {
    case "session_started":
      return typeof payload?.prompt === "string" ? (
        <UserBubble
          text={payload.prompt}
          timestamp={timestamp}
          actorId={actor?.id}
          actorName={actor?.name}
          imageKeys={asStringArray(payload?.imageKeys)}
          footer={<GitCheckpointChips checkpoints={promptGitCheckpoints} />}
        />
      ) : payload?.type === "runtime_move" ? (
        <SystemBadge
          text={
            typeof payload?.targetRuntimeLabel === "string" && payload.targetRuntimeLabel
              ? `Moved session to ${payload.targetRuntimeLabel}`
              : payload?.targetHosting === "cloud"
                ? "Moved session to cloud"
                : "Moved session to another runtime"
          }
        />
      ) : (
        <SystemBadge text="Session started" />
      );

    case "session_output":
      return payload
        ? renderSessionOutput(
            payload,
            timestamp,
            scopeKey,
            completedAgentTools,
            toolResultByUseId,
            gitCheckpointsByPromptEventId,
          )
        : null;

    case "message_sent":
      return (
        <UserBubble
          text={str(payload?.text)}
          timestamp={timestamp}
          actorId={actor?.id}
          actorName={actor?.name}
          imageKeys={asStringArray(payload?.imageKeys)}
          footer={<GitCheckpointChips checkpoints={promptGitCheckpoints} />}
        />
      );

    case "session_terminated": {
      if (payload?.reason === "bridge_complete") return null;
      if (payload?.reason === "workspace_failed") {
        const error = str(payload?.error);
        return <SystemBadge text={error || "Workspace preparation failed"} />;
      }
      if (payload?.reason === "manual_stop") {
        return <SystemBadge text="Session stopped" />;
      }
      if (payload?.sessionStatus === "merged") {
        return <SystemBadge text="Session merged" />;
      }
      if (payload?.agentStatus === "failed") {
        return <SystemBadge text="Session failed" />;
      }
      if (payload?.agentStatus === "stopped") {
        return <SystemBadge text="Session stopped" />;
      }
      if (payload?.agentStatus === "done") {
        return <SystemBadge text="Session completed" />;
      }
      return <SystemBadge text="Session terminated" />;
    }

    default:
      return null;
  }
});
