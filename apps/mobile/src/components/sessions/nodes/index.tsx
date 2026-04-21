import { memo, type ReactNode } from "react";
import type { Event } from "@trace/gql";
import { eventScopeKey, useScopedEventField, type SessionNode } from "@trace/client-core";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { AskUserQuestionCard } from "./AskUserQuestionCard";
import { CommandExecutionRow } from "./CommandExecutionRow";
import { PlanReviewCard } from "./PlanReviewCard";
import { PRCard, type PRCardKind } from "./PRCard";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { StreamRow } from "./StreamRow";
import { SystemBadge } from "./SystemBadge";
import { UserMessageBubble } from "./UserMessageBubble";
import { renderSessionOutput } from "./event-output";
import type { NodeRenderContext } from "./render-context";

interface RenderNodeProps {
  node: SessionNode;
  context: NodeRenderContext;
  isLast: boolean;
}

/**
 * Dispatches a `SessionNode` to its renderer. Every return flows through
 * `StreamRow`, which owns row padding — so when `EventNode` (or the session
 * output helpers) return null, no empty gap is left behind.
 */
export function renderNode(props: RenderNodeProps): ReactNode {
  const { node, context, isLast } = props;
  switch (node.kind) {
    case "command-execution":
      return (
        <StreamRow>
          <CommandExecutionRow
            command={node.command}
            output={node.output}
            timestamp={node.timestamp}
            exitCode={node.exitCode}
          />
        </StreamRow>
      );
    case "readglob-group":
      return (
        <StreamRow>
          <ReadGlobGroup items={node.items} />
        </StreamRow>
      );
    case "plan-review":
      return (
        <StreamRow>
          <PlanReviewCard
            planContent={node.planContent}
            planFilePath={node.planFilePath}
            timestamp={node.timestamp}
          />
        </StreamRow>
      );
    case "ask-user-question":
      return (
        <StreamRow>
          <AskUserQuestionCard questions={node.questions} timestamp={node.timestamp} />
        </StreamRow>
      );
    case "event":
      return <EventNode id={node.id} context={context} isLast={isLast} />;
  }
}

interface EventNodeProps {
  id: string;
  context: NodeRenderContext;
  isLast: boolean;
}

/**
 * Resolves the event content for a `kind: "event"` node and forwards it to
 * `StreamRow`. If the event type / payload combination has no renderer, the
 * computed `content` is null and `StreamRow` emits nothing.
 */
const EventNode = memo(function EventNode({ id, context, isLast }: EventNodeProps) {
  const scopeKey = eventScopeKey("session", context.sessionId);
  const eventType = useScopedEventField(scopeKey, id, "eventType") as Event["eventType"] | undefined;
  const payload = asJsonObject(useScopedEventField(scopeKey, id, "payload"));
  const timestamp = useScopedEventField(scopeKey, id, "timestamp") as string | undefined;
  const actor = useScopedEventField(scopeKey, id, "actor") as
    | { type: string; id: string; name?: string | null }
    | undefined;

  if (!eventType || !timestamp) return null;

  const content = dispatchEvent({
    id,
    eventType,
    payload,
    timestamp,
    actor,
    context,
    isLast,
  });
  return <StreamRow>{content}</StreamRow>;
});

interface DispatchEventArgs {
  id: string;
  eventType: Event["eventType"];
  payload: JsonObject | undefined;
  timestamp: string;
  actor: { type: string; id: string; name?: string | null } | undefined;
  context: NodeRenderContext;
  isLast: boolean;
}

function dispatchEvent(args: DispatchEventArgs): ReactNode {
  const { id, eventType, payload, timestamp, actor, context, isLast } = args;
  const checkpoints = context.gitCheckpointsByPromptEventId.get(id);

  switch (eventType) {
    case "session_started":
      if (typeof payload?.prompt === "string") {
        return (
          <UserMessageBubble
            text={payload.prompt}
            timestamp={timestamp}
            actorId={actor?.id}
            actorName={actor?.name}
            checkpoints={checkpoints}
          />
        );
      }
      return <SystemBadge text="Session started" />;

    case "message_sent":
      return (
        <UserMessageBubble
          text={typeof payload?.text === "string" ? payload.text : ""}
          timestamp={timestamp}
          actorId={actor?.id}
          actorName={actor?.name}
          checkpoints={checkpoints}
        />
      );

    case "session_output":
      return payload ? renderSessionOutput(payload, timestamp, context, isLast) : null;

    case "session_terminated":
      return <SystemBadge text={terminationText(payload)} />;

    case "session_pr_opened":
      return <PRCard kind="opened" prUrl={prUrlFrom(payload)} timestamp={timestamp} />;
    case "session_pr_merged":
      return <PRCard kind="merged" prUrl={prUrlFrom(payload)} timestamp={timestamp} />;
    case "session_pr_closed":
      return <PRCard kind="closed" prUrl={prUrlFrom(payload)} timestamp={timestamp} />;

    default:
      return null;
  }
}

function prUrlFrom(payload: JsonObject | undefined): string | null {
  if (!payload) return null;
  if (typeof payload.prUrl === "string") return payload.prUrl;
  const group = asJsonObject(payload.sessionGroup);
  if (group && typeof group.prUrl === "string") return group.prUrl;
  return null;
}

function terminationText(payload: JsonObject | undefined): string {
  if (!payload) return "Session terminated";
  if (payload.reason === "manual_stop") return "Session stopped";
  if (payload.reason === "workspace_failed") {
    const err = typeof payload.error === "string" ? payload.error : "";
    return err || "Workspace preparation failed";
  }
  if (payload.sessionStatus === "merged") return "Session merged";
  if (payload.agentStatus === "failed") return "Session failed";
  if (payload.agentStatus === "stopped") return "Session stopped";
  if (payload.agentStatus === "done") return "Session completed";
  return "Session terminated";
}

export type { NodeRenderContext, PRCardKind };
