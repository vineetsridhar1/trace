import { useEffect, useMemo, useState } from "react";
import type { AskUserQuestionNode, PlanReviewNode, ThreadStatus } from "../types";
import { ThreadEvent, PlanReview, AskUserQuestionInline } from "./ThreadEvent";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { PlanResponseBar } from "./PlanResponseBar";
import { TicketView } from "./TicketView";
import { WorktreeChanges } from "./WorktreeChanges";
import { TerminalTabs } from "./TerminalTabs";
import { Terminal } from "./Terminal";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadInput } from "./ThreadInput";
import { RunButtons } from "./RunButtons";
import { CreationStatusBar } from "./CreationStatusBar";
import { QueuedStatusBar } from "./QueuedStatusBar";
import { StickyTodoList } from "./StickyTodoList";
import { useClaudeActions } from "../context/ClaudeActionsContext";
import { useThreadContext } from "../context/ThreadContext";
import { useThreadEventsContext } from "../context/ThreadEventsContext";
import { normalizeToolName } from "../utils";

type ViewMode = "agent" | "ticket" | "files" | "terminal";

export function ThreadPanel() {
  const {
    threadWidth,
    dragging,
    activeThreadId,
    threads,
    expandedReadGroupIds,
    selectedMessageId,
    messageStatus,
    selectedTicket: ticket,
    deletingWorktree,
    hasWorktree,
    isClaudeRunning,
    scriptsAvailable,
    isFullscreen,
    channelTickets,
    setTicketDependencies,
    clearThread,
    switchThread,
    onRunScripts,
    toggleReadGroup,
    onClose,
    onDeleteWorktree,
    onEnterFullscreen,
    onExitFullscreen,
    onStartDrag,
    baseBranch,
    startupTerminals,
    activeTerminalTabId,
    terminalCwd,
    onSelectTerminalTab,
    onCloseTerminalTab,
    onCloseAllTerminals,
    onAddTerminal,
  } = useThreadContext();

  const {
    threadNodes,
    threadStatus,
    showJumpToLatest,
    threadContentRef,
    loadingOlderEvents,
    onThreadScroll,
    scrollToLatest,
  } = useThreadEventsContext();

  const {
    pendingRunMessageId,
    pendingRunInitialPrompt,
    runPendingMessage,
    stopClaude,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    clearPendingRun,
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
    // Scan backward for the most recent unanswered question,
    // stopping at a UserPromptSubmit boundary (which means it was answered)
    for (let i = threadNodes.length - 1; i >= 0; i--) {
      const node = threadNodes[i];
      if (node.kind === "ask-user-question") return node;
      if (
        node.kind === "event" &&
        node.event.hookEventName === "UserPromptSubmit"
      ) {
        break;
      }
    }
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

  if (!threadOpen) return null;

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
        className={`flex shrink-0 min-h-0 flex-col overflow-hidden border-l border-[#292e42] bg-[#16161e] ${dragging ? "" : "panel-animate"}`}
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
          isFullscreen={isFullscreen}
          onRunScripts={onRunScripts}
          onClose={onClose}
          onDeleteWorktree={onDeleteWorktree}
          onEnterFullscreen={onEnterFullscreen}
          onExitFullscreen={onExitFullscreen}
          onMergeToMain={() => void mergeToMain()}
          threads={threads}
          activeThreadId={activeThreadId}
          onSwitchThread={switchThread}
        />

        <div className="thread-panel-shell relative flex min-h-0 flex-1">
          {viewMode === "ticket" && ticket ? (
            <TicketView ticket={ticket} />
          ) : viewMode === "files" ? (
            <WorktreeChanges messageId={selectedMessageId} baseBranch={baseBranch} />
          ) : viewMode === "terminal" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {startupTerminals.length > 0 ? (
                <TerminalTabs
                  terminals={startupTerminals}
                  activeTabId={activeTerminalTabId}
                  cwd={terminalCwd}
                  onSelectTab={onSelectTerminalTab}
                  onCloseTab={onCloseTerminalTab}
                  onCloseAll={onCloseAllTerminals}
                  onAddTab={onAddTerminal}
                />
              ) : (
                <Terminal
                  terminalId={`thread-${selectedMessageId ?? "none"}`}
                  cwd={terminalCwd}
                />
              )}
            </div>
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
                      if (node.kind === "thread-divider") {
                        return (
                          <div key={node.id} className="my-3 flex items-center gap-3 px-2">
                            <div className="h-px flex-1 bg-violet-500/20" />
                            <span className="text-[10px] font-medium uppercase tracking-wider text-violet-400/60">
                              New Context
                            </span>
                            <div className="h-px flex-1 bg-violet-500/20" />
                          </div>
                        );
                      }
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
                        return <AskUserQuestionInline key={node.id} node={node} />;
                      }
                      if (node.kind !== "event") {
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

        {pendingRunMessageId === selectedMessageId && !isClaudeRunning ? (
          <RunButtons
            initialPrompt={pendingRunInitialPrompt}
            onRun={(planMode, prompt) => {
              void runPendingMessage(planMode, prompt);
            }}
            channelTickets={channelTickets}
            currentMessageId={pendingRunMessageId}
            onRunAfter={(depIds, runConfig) => {
              if (pendingRunMessageId) {
                setTicketDependencies(pendingRunMessageId, depIds, runConfig);
                clearPendingRun();
              }
            }}
          />
        ) : messageStatus === 'creation' ? (
          <CreationStatusBar />
        ) : messageStatus === 'queued' ? (
          <QueuedStatusBar key={selectedMessageId} messageId={selectedMessageId!} />
        ) : showQuestion ? (
          <AskUserQuestionBar
            node={showQuestion}
            onResponse={(text) => {
              void sendPlanResponse(text, 'keep-context');
            }}
            onDismiss={() => {
              setDismissedQuestionId(showQuestion.id);
              void stopClaude();
            }}
          />
        ) : showPlan ? (
          <PlanResponseBar
            node={showPlan}
            onPlanResponse={(text, mode) => {
              setDismissedPlanId(showPlan.id);
              void sendPlanResponse(
                text,
                mode,
                showPlan.planContent,
                showPlan.planFilePath,
              );
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
            onClearThread={clearThread}
          />
        )}

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
