import { memo } from "react";
import type { AgentToolResult, SessionNode } from "./groupReadGlob";
import { SessionMessage } from "./SessionMessage";
import { ReadGlobGroup } from "./messages/ReadGlobGroup";
import { PlanReviewCard } from "./messages/PlanReviewCard";
import { AskUserQuestionInline } from "./messages/AskUserQuestionInline";
import { CommandExecutionRow } from "./messages/CommandExecutionRow";
import type { MarkdownSteerBlock, MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";

export interface SessionNodeRendererProps {
  node: SessionNode;
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
  highlightEventId?: string | null;
  activePlanId?: string | null;
  replacedQuestionIds?: ReadonlySet<string>;
  planComments?: MarkdownSteerCommentsByBlock;
  onAddPlanComment?: (block: MarkdownSteerBlock, text: string) => void;
  onRemovePlanComment?: (blockId: string, commentId: string) => void;
  onForkSession?: (eventId: string) => void;
  canForkSession?: boolean;
  messageActionsEventIds?: ReadonlySet<string>;
}

export const SessionNodeRenderer = memo(function SessionNodeRenderer({
  node,
  completedAgentTools,
  toolResultByUseId,
  highlightEventId,
  activePlanId,
  replacedQuestionIds,
  planComments,
  onAddPlanComment,
  onRemovePlanComment,
  onForkSession,
  canForkSession = false,
  messageActionsEventIds,
}: SessionNodeRendererProps) {
  if (node.kind === "event") {
    return (
      <div
        data-event-id={node.id}
        className={
          highlightEventId === node.id
            ? "rounded-lg ring-2 ring-primary/50 transition-all duration-500"
            : undefined
        }
      >
        <SessionMessage
          id={node.id}
          completedAgentTools={completedAgentTools}
          toolResultByUseId={toolResultByUseId}
          onForkSession={onForkSession}
          canForkSession={canForkSession}
          showActions={messageActionsEventIds?.has(node.id) ?? false}
          repeatCount={node.repeatCount}
        />
      </div>
    );
  }

  if (node.kind === "command-execution") {
    return (
      <CommandExecutionRow
        command={node.command}
        output={node.output}
        timestamp={node.timestamp}
        exitCode={node.exitCode}
      />
    );
  }

  if (node.kind === "plan-review") {
    return (
      <PlanReviewCard
        commentable={node.id === activePlanId}
        comments={node.id === activePlanId ? planComments : undefined}
        onAddComment={onAddPlanComment}
        onRemoveComment={onRemovePlanComment}
        planContent={node.planContent}
        planFilePath={node.planFilePath}
        timestamp={node.timestamp}
      />
    );
  }

  if (node.kind === "ask-user-question") {
    return (
      <AskUserQuestionInline
        questions={node.questions}
        leadingText={node.leadingText}
        timestamp={node.timestamp}
        replaced={replacedQuestionIds?.has(node.id) ?? false}
      />
    );
  }

  return <ReadGlobGroup items={node.items} />;
});
