import { memo, type ReactNode } from "react";
import { eventScopeKey, useScopedEventField, type SessionNode } from "@trace/client-core";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { AskUserQuestionCard } from "./AskUserQuestionCard";
import { CommandExecutionRow } from "./CommandExecutionRow";
import { PlanReviewCard } from "./PlanReviewCard";
import { PRCard, type PRCardKind } from "./PRCard";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { SystemBadge } from "./SystemBadge";
import { UserMessageBubble } from "./UserMessageBubble";
import { renderSessionOutput } from "./event-output";
import type { NodeRenderContext } from "./render-context";

interface RenderNodeProps {
  node: SessionNode;
  context: NodeRenderContext;
}

/**
 * Dispatches a `SessionNode` to its renderer. Row padding is owned by
 * `SessionStream.renderItem` so every list cell has a stable element tree —
 * FlashList v2 recycles cells by shape and will crash ("Attempt to recycle
 * a mounted view") if the root varies between null and a View.
 *
 * Event-kind nodes the dispatcher can't render are filtered upstream by
 * `useSessionNodes`, so this switch only needs to handle the known cases.
 */
export function renderNode(props: RenderNodeProps): ReactNode {
  const { node, context } = props;
  switch (node.kind) {
    case "command-execution":
      return (
        <CommandExecutionRow command={node.command} output={node.output} exitCode={node.exitCode} />
      );
    case "readglob-group":
      return <ReadGlobGroup items={node.items} />;
    case "plan-review":
      return <PlanReviewCard planContent={node.planContent} planFilePath={node.planFilePath} />;
    case "ask-user-question":
      return <AskUserQuestionCard questions={node.questions} />;
    case "event":
      return <EventNode id={node.id} context={context} />;
  }
}

interface EventNodeProps {
  id: string;
  context: NodeRenderContext;
}

/**
 * Reads the event record for a `kind: "event"` node and dispatches on
 * `eventType`. `useSessionNodes` already screens out combinations this
 * switch doesn't handle, but the `default` returns null defensively in
 * case an event mutates after the filter pass.
 */
const EventNode = memo(function EventNode({ id, context }: EventNodeProps) {
  const scopeKey = eventScopeKey("session", context.sessionId);
  const eventType = useScopedEventField(scopeKey, id, "eventType");
  const payload = asJsonObject(useScopedEventField(scopeKey, id, "payload"));
  const actor = useScopedEventField(scopeKey, id, "actor");

  if (!eventType) return null;

  const checkpoints = context.gitCheckpointsByPromptEventId.get(id);

  switch (eventType) {
    case "session_started":
      if (typeof payload?.prompt === "string") {
        return (
          <UserMessageBubble
            text={payload.prompt}
            actorId={actor?.id}
            actorName={actor?.name}
            imageKeys={asStringArray(payload?.attachmentKeys ?? payload?.imageKeys)}
            imagePreviewUrls={asStringArray(payload?.imagePreviewUrls)}
            checkpoints={checkpoints}
          />
        );
      }
      return <SystemBadge text="Session started" />;

    case "message_sent":
      return (
        <UserMessageBubble
          text={typeof payload?.text === "string" ? payload.text : ""}
          actorId={actor?.id}
          actorName={actor?.name}
          imageKeys={asStringArray(payload?.attachmentKeys ?? payload?.imageKeys)}
          imagePreviewUrls={asStringArray(payload?.imagePreviewUrls)}
          checkpoints={checkpoints}
        />
      );

    case "session_output":
      return payload ? renderSessionOutput(payload, context) : null;

    case "session_pr_opened":
      return <PRCard kind="opened" prUrl={prUrlFrom(payload)} />;
    case "session_pr_merged":
      return <PRCard kind="merged" prUrl={prUrlFrom(payload)} />;
    case "session_pr_closed":
      return <PRCard kind="closed" prUrl={prUrlFrom(payload)} />;

    default:
      return null;
  }
});

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string") ? value : undefined;
}

function prUrlFrom(payload: JsonObject | undefined): string | null {
  if (!payload) return null;
  if (typeof payload.prUrl === "string") return payload.prUrl;
  const group = asJsonObject(payload.sessionGroup);
  if (group && typeof group.prUrl === "string") return group.prUrl;
  return null;
}

export type { NodeRenderContext, PRCardKind };
