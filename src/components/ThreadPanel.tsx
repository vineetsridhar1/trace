import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiGitMerge, FiMap, FiMaximize2, FiMinimize2, FiPlay, FiSend, FiTrash2, FiX } from "react-icons/fi";
import { Tooltip } from "./Tooltip";
import type {
  AskUserQuestionNode,
  DragTarget,
  KanbanTicket,
  PlanReviewNode,
  ThreadRenderNode,
  ThreadStatus,
  TicketStatus,
} from "../types";
import { ThreadEvent, PlanReview } from "./ThreadEvent";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { PlanResponseBar } from "./PlanResponseBar";
import { TicketView } from "./TicketView";
import { useSlashCommands } from "../hooks/useSlashCommands";

import { useClaudeActions } from "../context/ClaudeActionsContext";
import { useImageAttachments } from "../hooks/useImageAttachments";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { ImageThumbnails } from "./ImageThumbnails";
import { ModelEffortSelector } from "./ModelEffortSelector";
import { normalizeToolName } from "../utils";

type ViewMode = "agent" | "ticket";

interface ThreadPanelProps {
  threadWidth: number;
  dragging: DragTarget;
  threadStatus: ThreadStatus;
  activeThreadId: string | null;
  threadNodes: ThreadRenderNode[];
  expandedReadGroupIds: Record<string, boolean>;
  selectedMessageId: string | null;
  messageStatus: TicketStatus;
  ticket: KanbanTicket | null;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  showJumpToLatest: boolean;
  isClaudeRunning: boolean;
  threadContentRef: React.RefObject<HTMLDivElement | null>;
  scriptsAvailable: boolean;
  onRunScripts: () => void;
  onThreadScroll: () => void;
  onToggleReadGroup: (groupId: string) => void;
  onScrollToLatest: () => void;
  onClose: () => void;
  onDeleteWorktree: () => void;
  onStartDrag: () => void;
  isFullscreen?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
}

export function ThreadPanel({
  threadWidth,
  dragging,
  threadStatus,
  activeThreadId,
  threadNodes,
  expandedReadGroupIds,
  selectedMessageId,
  messageStatus,
  ticket,
  deletingWorktree,
  hasWorktree,
  showJumpToLatest,
  isClaudeRunning,
  threadContentRef,
  scriptsAvailable,
  onRunScripts,
  onThreadScroll,
  onToggleReadGroup,
  onScrollToLatest,
  onClose,
  onDeleteWorktree,
  onStartDrag,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
}: ThreadPanelProps) {
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

  // Detect question only when it's the last node (unanswered) and Claude isn't running
  const activeQuestionNode = useMemo((): AskUserQuestionNode | null => {
    if (isClaudeRunning) return null;
    const last = threadNodes[threadNodes.length - 1];
    if (last?.kind === "ask-user-question") return last;
    return null;
  }, [threadNodes, isClaudeRunning]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(
    null,
  );

  // The question to show in the bottom bar (null if dismissed or none active)
  const showQuestion =
    activeQuestionNode && activeQuestionNode.id !== dismissedQuestionId
      ? activeQuestionNode
      : null;

  // Detect plan-review only when it's the last node (unanswered) and Claude isn't running
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
                            onToggle={() => onToggleReadGroup(node.id)}
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
                onClick={onScrollToLatest}
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
      </div>
    </>
  );
}

function StickyTodoList({
  todos,
}: {
  todos: Array<{ content: string; status: string; activeForm?: string }>;
}) {
  const hasActive = todos.some((t) => t.status !== "completed");
  if (!hasActive) return null;

  return (
    <div className="sticky-todo-list border-t border-[#292e42] bg-[#1a1b26] px-4 py-2.5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#565f89]">
        Tasks
      </div>
      <ul className="space-y-1">
        {todos.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            {t.status === "in_progress" ? (
              <svg
                className="h-3 w-3 flex-shrink-0 animate-spin text-violet-400"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                />
              </svg>
            ) : t.status === "completed" ? (
              <FiCheck className="h-3 w-3 flex-shrink-0 text-green-400" aria-hidden="true" />
            ) : (
              <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-[#565f89]" />
            )}
            <span
              className={
                t.status === "completed"
                  ? "text-[#565f89] line-through"
                  : t.status === "in_progress"
                    ? "text-violet-300"
                    : "text-[#a9b1d6]"
              }
            >
              {t.status === "in_progress" && t.activeForm
                ? t.activeForm
                : t.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const HEADER_STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "text-yellow-400 bg-yellow-400/10" },
  creation: {
    label: "Creating",
    className: "text-orange-400 bg-orange-400/10",
  },
  in_progress: {
    label: "In Progress",
    className: "text-blue-400 bg-blue-400/10",
  },
  completed: {
    label: "Completed",
    className: "text-green-400 bg-green-400/10",
  },
};

function ThreadHeader({
  selectedMessageId,
  messageStatus,
  hasTicket,
  viewMode,
  onSetViewMode,
  deletingWorktree,
  hasWorktree,
  scriptsAvailable,
  onRunScripts,
  isFullscreen,
  onClose,
  onDeleteWorktree,
  onMergeToMain,
  onEnterFullscreen,
  onExitFullscreen,
}: {
  selectedMessageId: string | null;
  messageStatus: TicketStatus;
  hasTicket: boolean;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  scriptsAvailable: boolean;
  onRunScripts: () => void;
  isFullscreen: boolean;
  onClose: () => void;
  onDeleteWorktree: () => void;
  onMergeToMain: () => void;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
}) {
  const statusConfig =
    HEADER_STATUS_CONFIG[messageStatus] ?? HEADER_STATUS_CONFIG.pending;

  return (
    <div
      id="thread-header"
      className="flex items-center justify-between border-b border-[#292e42] px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-violet-300">
          {selectedMessageId
            ? `trace/${selectedMessageId.slice(0, 8)}`
            : "Thread"}
        </h3>
        {selectedMessageId && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusConfig.className}`}
          >
            {statusConfig.label}
          </span>
        )}
        {hasTicket && (
          <div className="flex rounded-lg bg-[#1f2335] p-0.5">
            <button
              type="button"
              onClick={() => onSetViewMode("agent")}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "agent"
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-[#565f89] hover:text-[#a9b1d6]"
              }`}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => onSetViewMode("ticket")}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "ticket"
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-[#565f89] hover:text-[#a9b1d6]"
              }`}
            >
              Ticket
            </button>
          </div>
        )}
        {hasWorktree === false &&
          messageStatus !== "pending" &&
          messageStatus !== "creation" &&
          selectedMessageId && (
            <span className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] text-[#565f89]">
              Worktree deleted
            </span>
          )}
      </div>
      <div className="flex items-center gap-2">
        {hasWorktree === true && scriptsAvailable && (
          <Tooltip text="Run startup scripts" position="bottom">
            <button
              type="button"
              onClick={onRunScripts}
              className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-green-400/50 hover:text-green-300"
            >
              <FiPlay className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {hasWorktree === true && !isFullscreen && onEnterFullscreen && (
          <Tooltip text="Fullscreen" position="bottom">
            <button
              type="button"
              onClick={onEnterFullscreen}
              className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-violet-400/50 hover:text-violet-300"
            >
              <FiMaximize2 className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {isFullscreen && onExitFullscreen && (
          <Tooltip text="Exit fullscreen" position="bottom">
            <button
              type="button"
              onClick={onExitFullscreen}
              className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-violet-400/50 hover:text-violet-300"
            >
              <FiMinimize2 className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {hasWorktree === true && messageStatus === "in_progress" && (
          <button
            id="thread-merge-to-main"
            type="button"
            disabled={!selectedMessageId}
            onClick={onMergeToMain}
            className="h-7 cursor-pointer rounded-md border border-[#292e42] px-2 text-xs text-[#565f89] transition-colors hover:border-green-400/50 hover:text-green-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex items-center gap-1">
              <FiGitMerge className="h-3.5 w-3.5" aria-hidden="true" />
              Merge
            </span>
          </button>
        )}
        {hasWorktree === true && (
          <Tooltip text="Delete worktree" position="bottom">
            <button
              id="thread-delete-worktree"
              type="button"
              disabled={!selectedMessageId || deletingWorktree}
              onClick={onDeleteWorktree}
              className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiTrash2 className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        <Tooltip text="Close thread" position="bottom">
          <button
            id="thread-close"
            type="button"
            onClick={
              isFullscreen && onExitFullscreen ? onExitFullscreen : onClose
            }
            className="cursor-pointer text-[#565f89] hover:text-[#c0caf5]"
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
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

function PlanModeToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip text={active ? "Plan mode on" : "Plan mode"}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
          active
            ? "border-violet-500 bg-violet-500/20 text-violet-300"
            : "border-[#292e42] bg-[#1a1b26] text-[#565f89] hover:border-[#3b3f5c] hover:text-[#a9b1d6]"
        }`}
      >
        <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span
          className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
            active ? "ml-1 max-w-[36px] opacity-100" : "max-w-0 opacity-0"
          }`}
        >
          Plan
        </span>
      </button>
    </Tooltip>
  );
}

function RunButtons({
  initialPrompt,
  onRun,
}: {
  initialPrompt: string;
  onRun: (planMode: boolean, prompt: string) => Promise<void> | void;
}) {
  const {
    selectedModel,
    selectedEffort,
    setSelectedModel,
    setSelectedEffort,
  } = useClaudeActions();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [planMode, setPlanMode] = useState(false);
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <textarea
        rows={1}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onRun(planMode, prompt);
          }
        }}
        style={{ fieldSizing: 'content', minHeight: 38, maxHeight: 300 } as React.CSSProperties}
        className="mb-2 w-full resize-none rounded-md border border-[#292e42] bg-[#1a1b26] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
      />
      <div className="mb-2 flex items-center gap-1.5">
        <ModelEffortSelector
          model={selectedModel}
          effort={selectedEffort}
          onModelChange={setSelectedModel}
          onEffortChange={setSelectedEffort}
        />
        <PlanModeToggle
          active={planMode}
          onToggle={() => setPlanMode((p) => !p)}
        />
      </div>
      <button
        type="button"
        onClick={() => onRun(planMode, prompt)}
        className="w-full cursor-pointer rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
      >
        Run
      </button>
    </div>
  );
}

function ElapsedTimer({ startTime }: { startTime: string }) {
  const startRef = useRef(new Date(startTime).getTime());
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startRef.current) / 1000),
  );

  useEffect(() => {
    startRef.current = new Date(startTime).getTime();
    setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
  }, [startTime]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.max(0, elapsed);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const h = Math.floor(m / 60);
  const display =
    h > 0
      ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;

  return (
    <span className="tabular-nums text-xs text-violet-400/70">{display}</span>
  );
}

function ThreadInput({
  isClaudeRunning,
  lastUserMessageTime,
  onSendThreadMessage,
  onStopClaude,
}: {
  isClaudeRunning: boolean;
  lastUserMessageTime: string | null;
  onSendThreadMessage: (
    text: string,
    attachmentIds?: string[],
    filePaths?: string[],
  ) => Promise<boolean>;
  onStopClaude: () => void;
}) {
  const {
    selectedModel,
    selectedEffort,
    setSelectedModel,
    setSelectedEffort,
  } = useClaudeActions();
  const [threadInput, setThreadInput] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const slashCommands = useSlashCommands(threadInput, setThreadInput);
  const imageAttachments = useImageAttachments();

  const handleSendThreadMessage = useCallback(async () => {
    const text = threadInput.trim();
    if (!text || isClaudeRunning) return;

    const finalText = planMode
      ? `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${text}`
      : text;

    const attachmentIds = imageAttachments.getAttachmentIds();
    const filePaths = imageAttachments.getFilePaths();
    const sent = await onSendThreadMessage(
      finalText,
      attachmentIds.length > 0 ? attachmentIds : undefined,
      filePaths.length > 0 ? filePaths : undefined,
    );
    if (sent) {
      setThreadInput("");
      imageAttachments.clearAttachments();
    }
  }, [threadInput, planMode, isClaudeRunning, onSendThreadMessage, imageAttachments]);

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      {isClaudeRunning && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <svg
            className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
          <span className="text-xs text-violet-400">Claude is working...</span>
          {lastUserMessageTime && (
            <ElapsedTimer startTime={lastUserMessageTime} />
          )}
        </div>
      )}
      <ImageThumbnails
        images={imageAttachments.attachments}
        onRemove={imageAttachments.removeAttachment}
      />
      {imageAttachments.uploading && (
        <div className="flex items-center gap-2 px-1 pb-2">
          <svg
            className="h-3.5 w-3.5 animate-spin text-violet-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
          <span className="text-xs text-[#565f89]">Uploading...</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="relative flex flex-col flex-1">
          <SlashCommandMenu
            isOpen={slashCommands.isOpen}
            commands={slashCommands.filteredCommands}
            selectedIndex={slashCommands.selectedIndex}
            onSelect={slashCommands.selectCommand}
          />
          <textarea
            id="thread-input"
            rows={1}
            value={threadInput}
            disabled={isClaudeRunning}
            onChange={(e) => setThreadInput(e.target.value)}
            onPaste={(e) => void imageAttachments.handlePaste(e)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && e.shiftKey) {
                e.preventDefault();
                setPlanMode((p) => !p);
                return;
              }
              if (slashCommands.handleKeyDown(e)) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isClaudeRunning) void handleSendThreadMessage();
              }
            }}
            placeholder={
              isClaudeRunning ? "Waiting for Claude..." : "Send to Claude..."
            }
            style={{ fieldSizing: 'content', minHeight: 38, maxHeight: 300 } as React.CSSProperties}
            className={`w-full resize-none rounded-md border border-[#292e42] bg-[#1a1b26] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500 ${isClaudeRunning ? "opacity-50 cursor-not-allowed" : ""}`}
          />
        </div>
        {isClaudeRunning ? (
          <Tooltip text="Stop Claude">
            <button
              id="thread-stop"
              type="button"
              onClick={onStopClaude}
              className="h-[38px] cursor-pointer rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          </Tooltip>
        ) : (
          <Tooltip text="Send message">
            <button
              id="thread-send"
              type="button"
              onClick={() => void handleSendThreadMessage()}
              className="h-[38px] cursor-pointer rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
            >
              <FiSend className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      {!isClaudeRunning && (
        <div className="mt-2 flex items-center gap-1.5">
          <ModelEffortSelector
            model={selectedModel}
            effort={selectedEffort}
            onModelChange={setSelectedModel}
            onEffortChange={setSelectedEffort}
          />
          <PlanModeToggle
            active={planMode}
            onToggle={() => setPlanMode((p) => !p)}
          />
        </div>
      )}
    </div>
  );
}
