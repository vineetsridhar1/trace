import React, { useEffect, useMemo, useState } from "react";
import type { AskUserQuestionNode, PlanReviewNode, SessionStatus } from "../types";
import { ThreadEvent, PlanReview, AskUserQuestionInline } from "./ThreadEvent";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { CollapsedTurnGroup } from "./CollapsedTurnGroup";
import { AssistantTextRow } from "./thread-events/AssistantTextRow";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { PlanResponseBar } from "./PlanResponseBar";
import { TicketView } from "./TicketView";
import { WorktreeChanges } from "./WorktreeChanges";
import { TerminalTabs } from "./TerminalTabs";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadInput } from "./ThreadInput";
import { RunButtons } from "./RunButtons";
import { CreationStatusBar } from "./CreationStatusBar";
import { QueuedStatusBar } from "./QueuedStatusBar";
import { StickyTodoList } from "./StickyTodoList";
import { useClaudeActions } from "../context/ClaudeActionsContext";
import { useThreadContext } from "../context/ThreadContext";
import { useThreadEventsContext } from "../context/ThreadEventsContext";
import { normalizeToolName, stripTraceInternal } from "../utils";

type ViewMode = "agent" | "ticket" | "files" | "terminal";

export function ThreadPanel() {
  const {
    threadWidth,
    dragging,
    activeSessionId,
    sessions,
    expandedReadGroupIds,
    expandedTurnGroupIds,
    selectedWorkspaceId,
    workspaceStatus,
    selectedTicket: ticket,
    deletingWorktree,
    hasWorktree,
    isClaudeRunning,
    scriptsAvailable,
    hasSetupScript,
    hasRunScript,
    isFullscreen,
    channelTickets,
    setTicketDependencies,
    clearSession,
    switchSession,
    onRerunScript,
    onStopScript,
    runScriptRunning,
    toggleReadGroup,
    toggleTurnGroup,
    onClose,
    onDeleteWorktree,
    onEnterFullscreen,
    onExitFullscreen,
    onStartDrag,
    baseBranch,
    terminals,
    allTerminalEntries,
    activeTerminalTabId,
    terminalCwd,
    onSelectTerminalTab,
    onCloseTerminalTab,
    onCloseAllTerminals,
    onAddTerminal,
    onOpenSettings,
  } = useThreadContext();

  const {
    sessionNodes,
    sessionStatus,
    showJumpToLatest,
    threadContentRef,
    loadingOlderEvents,
    onThreadScroll,
    scrollToLatest,
  } = useThreadEventsContext();

  const {
    pendingRunWorkspaceId,
    pendingRunInitialPrompt,
    runPendingWorkspace,
    stopClaude,
    sendThreadMessage,
    sendPlanResponse,
    mergeToMain,
    markMerged,
    clearPendingRun,
  } = useClaudeActions();

  const lastUserMessageTime = useMemo(() => {
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (
        node.kind === "event" &&
        node.event.hookEventName === "UserPromptSubmit"
      ) {
        return node.event.timestamp;
      }
    }
    return null;
  }, [sessionNodes]);

  const latestTodos = useMemo(() => {
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
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
  }, [sessionNodes]);

  const activeQuestionNode = useMemo((): AskUserQuestionNode | null => {
    if (isClaudeRunning) return null;
    // Scan backward for the most recent unanswered question,
    // stopping at a UserPromptSubmit boundary (which means it was answered)
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (node.kind === "ask-user-question") return node;
      if (
        node.kind === "event" &&
        node.event.hookEventName === "UserPromptSubmit"
      ) {
        break;
      }
    }
    return null;
  }, [sessionNodes, isClaudeRunning]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);
  const showQuestion =
    activeQuestionNode && activeQuestionNode.id !== dismissedQuestionId
      ? activeQuestionNode
      : null;

  const activePlanNode = useMemo((): PlanReviewNode | null => {
    if (isClaudeRunning) return null;
    const last = sessionNodes[sessionNodes.length - 1];
    if (last?.kind === "plan-review") return last;
    return null;
  }, [sessionNodes, isClaudeRunning]);

  const [dismissedPlanId, setDismissedPlanId] = useState<string | null>(null);
  const showPlan =
    activePlanNode && activePlanNode.id !== dismissedPlanId
      ? activePlanNode
      : null;

  const [viewMode, setViewMode] = useState<ViewMode>("agent");

  useEffect(() => {
    setViewMode(workspaceStatus === 'merged' ? 'ticket' : 'agent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId]);


  const isOpen = selectedWorkspaceId !== null;

  return (
    <>
      {!isFullscreen && isOpen && (
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
        className={`flex shrink-0 min-h-0 flex-col overflow-hidden ${isOpen ? 'border-l border-[#292e42]' : ''} bg-[#16161e] ${dragging ? "" : "panel-animate"}`}
        style={
          isFullscreen ? { flex: "1 1 0%" } : { width: isOpen ? `${threadWidth}px` : 0 }
        }
      >
        <ThreadHeader
          selectedWorkspaceId={selectedWorkspaceId}
          workspaceStatus={workspaceStatus}
          hasTicket={ticket !== null}
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          deletingWorktree={deletingWorktree}
          hasWorktree={hasWorktree}
          isFullscreen={isFullscreen}
          onClose={onClose}
          onDeleteWorktree={onDeleteWorktree}
          onEnterFullscreen={onEnterFullscreen}
          onExitFullscreen={onExitFullscreen}
          onMergeToMain={() => void mergeToMain()}
          onMarkMerged={() => void markMerged()}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSwitchSession={switchSession}
        />

        <div className="thread-panel-shell relative flex min-h-0 flex-1">
          {viewMode === "ticket" && ticket ? (
            <TicketView ticket={ticket} />
          ) : viewMode === "files" ? (
            <WorktreeChanges workspaceId={selectedWorkspaceId} baseBranch={baseBranch} />
          ) : viewMode === "terminal" ? null : (
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
                    status={sessionStatus}
                    activeSessionId={activeSessionId}
                  />

                  {(() => {
                    let lastUserPromptTime: string | null = null;
                    return sessionNodes.map((node) => {
                      if (node.kind === "session-divider") {
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
                        const groupAssistantText = node.events[0]?.lastAssistantMessage
                          ? stripTraceInternal(node.events[0].lastAssistantMessage).trim()
                          : '';
                        return (
                          <React.Fragment key={node.id}>
                            {groupAssistantText && <AssistantTextRow text={groupAssistantText} />}
                            <ReadGlobGroup
                              node={node}
                              isExpanded={Boolean(expandedReadGroupIds[node.id])}
                              onToggle={() => toggleReadGroup(node.id)}
                            />
                          </React.Fragment>
                        );
                      }
                      if (node.kind === "collapsed-turn") {
                        return (
                          <CollapsedTurnGroup
                            key={node.id}
                            node={node}
                            isExpanded={Boolean(expandedTurnGroupIds[node.id])}
                            onToggle={() => toggleTurnGroup(node.id)}
                            expandedReadGroupIds={expandedReadGroupIds}
                            toggleReadGroup={toggleReadGroup}
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

          {/* Terminal area — always mounted to preserve PTYs across workspace/view switches */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ display: viewMode === 'terminal' ? 'flex' : 'none' }}
          >
            {hasWorktree === false ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[#565f89]">
                No worktree available
              </div>
            ) : allTerminalEntries.length > 0 ? (
              <TerminalTabs
                terminals={terminals}
                allTerminalEntries={allTerminalEntries}
                currentWorkspaceId={selectedWorkspaceId}
                activeTabId={activeTerminalTabId}
                cwd={terminalCwd}
                runScriptRunning={runScriptRunning}
                scriptsAvailable={scriptsAvailable}
                hasSetupScript={hasSetupScript}
                hasRunScript={hasRunScript}
                onSelectTab={onSelectTerminalTab}
                onCloseTab={onCloseTerminalTab}
                onCloseAll={onCloseAllTerminals}
                onAddTab={onAddTerminal}
                onRunScript={() => onRerunScript('Run')}
                onStopScript={() => onStopScript('Run')}
                onRerunSetup={() => onRerunScript('Setup')}
                onOpenSettings={onOpenSettings}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[#565f89]">
                Initializing terminals...
              </div>
            )}
          </div>
        </div>

        {viewMode === "agent" && isClaudeRunning && latestTodos && (
          <StickyTodoList todos={latestTodos} />
        )}

        {viewMode === "agent" && (
          pendingRunWorkspaceId === selectedWorkspaceId && !isClaudeRunning ? (
            <RunButtons
              initialPrompt={pendingRunInitialPrompt}
              onRun={(planMode, prompt) => {
                void runPendingWorkspace(planMode, prompt);
              }}
              channelTickets={channelTickets}
              currentWorkspaceId={pendingRunWorkspaceId}
              onRunAfter={(depIds, runConfig) => {
                if (pendingRunWorkspaceId) {
                  setTicketDependencies(pendingRunWorkspaceId, depIds, runConfig);
                  clearPendingRun();
                }
              }}
            />
          ) : workspaceStatus === 'creation' ? (
            <CreationStatusBar />
          ) : workspaceStatus === 'queued' ? (
            <QueuedStatusBar key={selectedWorkspaceId} workspaceId={selectedWorkspaceId!} />
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
              onClearThread={clearSession}
            />
          )
        )}

      </div>
    </>
  );
}

function ThreadStatusMessage({
  status,
  activeSessionId,
}: {
  status: SessionStatus;
  activeSessionId: string | null;
}) {
  if (status === "loading") {
    return <div className="text-sm text-[#565f89]">Loading events...</div>;
  }
  if (status === "empty") {
    return (
      <div className="text-sm text-[#565f89]">
        {activeSessionId
          ? "No events yet"
          : "No sessions yet. Create a workspace to start."}
      </div>
    );
  }
  if (status === "error") {
    return <div className="text-sm text-red-400">Failed to load events</div>;
  }
  return null;
}
