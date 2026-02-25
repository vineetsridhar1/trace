import { useEffect, useMemo, useState } from "react";
import type { AskUserQuestionNode, PlanReviewNode, ThreadStatus } from "../types";
import { ThreadEvent, PlanReview } from "./ThreadEvent";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { PlanResponseBar } from "./PlanResponseBar";
import { TicketView } from "./TicketView";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadInput } from "./ThreadInput";
import { RunButtons } from "./RunButtons";
import { StickyTodoList } from "./StickyTodoList";
import { ContextProgressBar } from "./ContextProgressBar";
import { useClaudeActions } from "../context/ClaudeActionsContext";
import { useThreadContext } from "../context/ThreadContext";
import { normalizeToolName } from "../utils";

type ViewMode = "agent" | "ticket";

export function ThreadPanel() {
  const {
    threadWidth,
    dragging,
    threadStatus,
    activeThreadId,
    threadNodes,
    threadEvents,
    expandedReadGroupIds,
    selectedMessageId,
    messageStatus,
    selectedTicket: ticket,
    deletingWorktree,
    hasWorktree,
    showJumpToLatest,
    isClaudeRunning,
    threadContentRef,
    scriptsAvailable,
    isFullscreen,
    loadingOlderEvents,
    onRunScripts,
    onThreadScroll,
    toggleReadGroup,
    scrollToLatest,
    onClose,
    onDeleteWorktree,
    onStartDrag,
    onEnterFullscreen,
    onExitFullscreen,
  } = useThreadContext();

  const {
    pendingRunMessageId,
    pendingRunInitialPrompt,
    runPendingMessage,
    stopClaude,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
  } = useClaudeActions();

  const threadOpen = threadWidth > 0;

  const lastUserMessageTime = useMemo(() => {
    for (let i = threadNodes.length - 1; i >= 0; i--) {
      const node = threadNodes[i];
      if (
        node.kind === "event" &&
        node.event.hookEventName === "UserPromptSubmit"
      ) {
        return node.event.timestamp;
      }
    }
    return null;
  }, [threadNodes]);

  const latestTodos = useMemo(() => {
    for (let i = threadNodes.length - 1; i >= 0; i--) {
      const node = threadNodes[i];
      if (
        node.kind === "event" &&
        node.event.hookEventName === "PostToolUse" &&
        normalizeToolName(node.event.toolName) === "todowrite"
      ) {
        const input = node.event.toolInput as Record<string, unknown> | null;
        const todos = input?.todos as
          | Array<{ content: string; status: string; activeForm?: string }>
          | undefined;
        if (Array.isArray(todos) && todos.length > 0) return todos;
      }
    }
    return null;
  }, [threadNodes]);

  const activeQuestionNode = useMemo((): AskUserQuestionNode | null => {
    if (isClaudeRunning) return null;
    const last = threadNodes[threadNodes.length - 1];
    if (last?.kind === "ask-user-question") return last;
    return null;
  }, [threadNodes, isClaudeRunning]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);
  const showQuestion =
    activeQuestionNode && activeQuestionNode.id !== dismissedQuestionId
      ? activeQuestionNode
      : null;

  const activePlanNode = useMemo((): PlanReviewNode | null => {
    if (isClaudeRunning) return null;
    const last = threadNodes[threadNodes.length - 1];
    if (last?.kind === "plan-review") return last;
    return null;
  }, [threadNodes, isClaudeRunning]);

  const [dismissedPlanId, setDismissedPlanId] = useState<string | null>(null);
  const showPlan =
    activePlanNode && activePlanNode.id !== dismissedPlanId
      ? activePlanNode
      : null;

  const [viewMode, setViewMode] = useState<ViewMode>("agent");

  useEffect(() => {
    if (messageStatus === "completed" && ticket) {
      setViewMode("ticket");
    } else {
      setViewMode("agent");
    }
  }, [selectedMessageId]);

  return (
    <>
      {threadOpen && !isFullscreen && (
        <div
          className={`resize-handle ${dragging === "right" ? "active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onStartDrag();
          }}
        />
      )}

      <div
        id="thread-panel"
        className={`flex min-h-0 flex-col overflow-hidden border-l border-[#292e42] bg-[#16161e] ${dragging ? "" : "panel-animate"}`}
        style={
          isFullscreen ? { flex: "1 1 50%" } : { width: `${threadWidth}px` }
        }
      >
        <ThreadHeader
          selectedMessageId={selectedMessageId}
          messageStatus={messageStatus}
          hasTicket={ticket !== null}
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          deletingWorktree={deletingWorktree}
          hasWorktree={hasWorktree}
          scriptsAvailable={scriptsAvailable}
          onRunScripts={onRunScripts}
          isFullscreen={isFullscreen}
          onClose={onClose}
          onDeleteWorktree={onDeleteWorktree}
          onMergeToMain={() => void mergeToMain()}
          onEnterFullscreen={onEnterFullscreen}
          onExitFullscreen={onExitFullscreen}
          threadEvents={threadEvents}
        />

        <div className="thread-panel-shell relative flex min-h-0 flex-1">
          {viewMode === "ticket" && ticket ? (
            <TicketView ticket={ticket} />
          ) : (
            <>
              <div
                id="thread-content"
                ref={threadContentRef}
                onScroll={onThreadScroll}
                className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
              >
                <div className="thread-events-list">
                  {loadingOlderEvents && (
                    <div className="py-2 text-center text-xs text-[#565f89]">Loading older events...</div>
                  )}
                  <ThreadStatusMessage
                    status={threadStatus}
                    activeThreadId={activeThreadId}
                  />

                  {(() => {
                    let lastUserPromptTime: string | null = null;
                    return threadNodes.map((node) => {
                      if (node.kind === "readglob-group") {
                        return (
                          <ReadGlobGroup
                            key={node.id}
                            node={node}
                            isExpanded={Boolean(expandedReadGroupIds[node.id])}
                            onToggle={() => toggleReadGroup(node.id)}
                          />
                        );
                      }
                      if (node.kind === "plan-review") {
                        return <PlanReview key={node.id} node={node} />;
                      }
                      if (node.kind === "ask-user-question") {
                        return null;
                      }
                      if (node.event.hookEventName === "UserPromptSubmit") {
                        lastUserPromptTime = node.event.timestamp;
                      }
                      let duration: number | undefined;
                      if (node.event.hookEventName === "Stop" && lastUserPromptTime) {
                        duration = Math.floor(
                          (new Date(node.event.timestamp).getTime() -
                            new Date(lastUserPromptTime).getTime()) /
                            1000,
                        );
                      }
                      return (
                        <ThreadEvent key={node.event.id} event={node.event} duration={duration} />
                      );
                    });
                  })()}
                </div>
              </div>

              <button
                type="button"
                onClick={scrollToLatest}
                className={`jump-latest-chip ${showJumpToLatest ? "visible" : ""}`}
              >
                Jump to latest
              </button>
            </>
          )}
        </div>

        {viewMode === "agent" && isClaudeRunning && latestTodos && (
          <StickyTodoList todos={latestTodos} />
        )}

        {pendingRunMessageId === selectedMessageId ? (
          <RunButtons
            initialPrompt={pendingRunInitialPrompt}
            onRun={(planMode, prompt) => {
              void runPendingMessage(planMode, prompt);
            }}
          />
        ) : showQuestion ? (
          <AskUserQuestionBar
            node={showQuestion}
            onResponse={(text) => {
              void sendPlanResponse(text);
            }}
            onDismiss={() => {
              setDismissedQuestionId(showQuestion.id);
              void stopClaude();
            }}
          />
        ) : showPlan ? (
          <PlanResponseBar
            node={showPlan}
            onPlanResponse={(text) => {
              setDismissedPlanId(showPlan.id);
              void sendPlanResponse(text);
            }}
            onDismiss={() => {
              setDismissedPlanId(showPlan.id);
              void stopClaude();
            }}
          />
        ) : (
          <ThreadInput
            isClaudeRunning={isClaudeRunning}
            lastUserMessageTime={lastUserMessageTime}
            onSendThreadMessage={sendThreadMessage}
            onStopClaude={() => void stopClaude()}
          />
        )}

        <ContextProgressBar events={threadEvents} />
      </div>
    </>
  );
}

function ThreadStatusMessage({
  status,
  activeThreadId,
}: {
  status: ThreadStatus;
  activeThreadId: string | null;
}) {
  if (status === "loading") {
    return <div className="text-sm text-[#565f89]">Loading events...</div>;
  }
  if (status === "empty") {
    return (
      <div className="text-sm text-[#565f89]">
        {activeThreadId
          ? "No events yet"
          : "No threads yet. Create a workspace to start."}
      </div>
    );
  }
  if (status === "error") {
    return <div className="text-sm text-red-400">Failed to load events</div>;
  }
  return null;
}
