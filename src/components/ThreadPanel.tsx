import { useEffect, useRef } from 'react';
import type { DragTarget, ThreadRenderNode, ThreadStatus } from '../types';
import { ThreadEvent, PlanReview, AskUserQuestion } from './ThreadEvent';
import { ReadGlobGroup } from './ReadGlobGroup';

function useAutoResize(value: string, maxHeight = 300) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!value) {
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);
  return ref;
}

interface ThreadPanelProps {
  threadWidth: number;
  dragging: DragTarget;
  threadStatus: ThreadStatus;
  activeThreadId: string | null;
  threadNodes: ThreadRenderNode[];
  expandedReadGroupIds: Record<string, boolean>;
  selectedMessageId: string | null;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  showJumpToLatest: boolean;
  threadInput: string;
  isClaudeRunning: boolean;
  threadContentRef: React.RefObject<HTMLDivElement | null>;
  pendingRunMessageId: string | null;
  onRun: (planMode: boolean) => void;
  onThreadScroll: () => void;
  onToggleReadGroup: (groupId: string) => void;
  onScrollToLatest: () => void;
  onClose: () => void;
  onDeleteWorktree: () => void;
  onMergeToMain: () => void;
  onThreadInputChange: (value: string) => void;
  onSendThreadMessage: () => void;
  onPlanResponse: (text: string, claudePrompt?: string) => void;
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
  deletingWorktree,
  hasWorktree,
  showJumpToLatest,
  threadInput,
  isClaudeRunning,
  threadContentRef,
  pendingRunMessageId,
  onRun,
  onThreadScroll,
  onToggleReadGroup,
  onScrollToLatest,
  onClose,
  onDeleteWorktree,
  onMergeToMain,
  onThreadInputChange,
  onSendThreadMessage,
  onPlanResponse,
  onStartDrag,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
}: ThreadPanelProps) {
  const threadOpen = threadWidth > 0;

  return (
    <>
      {threadOpen && !isFullscreen && (
        <div
          className={`resize-handle ${dragging === 'right' ? 'active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onStartDrag();
          }}
        />
      )}

      <div
        id="thread-panel"
        className={`flex min-h-0 flex-col overflow-hidden border-l border-[#292e42] bg-[#16161e] ${dragging ? '' : 'panel-animate'}`}
        style={isFullscreen ? { flex: '1 1 50%' } : { width: `${threadWidth}px` }}
      >
        <ThreadHeader
          selectedMessageId={selectedMessageId}
          deletingWorktree={deletingWorktree}
          hasWorktree={hasWorktree}
          isFullscreen={isFullscreen}
          onClose={onClose}
          onDeleteWorktree={onDeleteWorktree}
          onMergeToMain={onMergeToMain}
          onEnterFullscreen={onEnterFullscreen}
          onExitFullscreen={onExitFullscreen}
        />

        <div className="thread-panel-shell relative flex min-h-0 flex-1">
          <div
            id="thread-content"
            ref={threadContentRef}
            onScroll={onThreadScroll}
            className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            <div className="thread-events-list">
              <ThreadStatusMessage status={threadStatus} activeThreadId={activeThreadId} />

              {threadNodes.map((node) => {
                if (node.kind === 'readglob-group') {
                  return (
                    <ReadGlobGroup
                      key={node.id}
                      node={node}
                      isExpanded={Boolean(expandedReadGroupIds[node.id])}
                      onToggle={() => onToggleReadGroup(node.id)}
                    />
                  );
                }
                if (node.kind === 'plan-review') {
                  return (
                    <PlanReview
                      key={node.id}
                      node={node}
                      onPlanResponse={onPlanResponse}
                    />
                  );
                }
                if (node.kind === 'ask-user-question') {
                  return (
                    <AskUserQuestion
                      key={node.id}
                      node={node}
                      onResponse={onPlanResponse}
                    />
                  );
                }
                return <ThreadEvent key={node.event.id} event={node.event} />;
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={onScrollToLatest}
            className={`jump-latest-chip ${showJumpToLatest ? 'visible' : ''}`}
          >
            Jump to latest
          </button>
        </div>

        {pendingRunMessageId === selectedMessageId ? (
          <RunButtons onRun={onRun} />
        ) : (
          <ThreadInput
            threadInput={threadInput}
            isClaudeRunning={isClaudeRunning}
            onThreadInputChange={onThreadInputChange}
            onSendThreadMessage={onSendThreadMessage}
          />
        )}
      </div>
    </>
  );
}

function ThreadHeader({
  selectedMessageId,
  deletingWorktree,
  hasWorktree,
  isFullscreen,
  onClose,
  onDeleteWorktree,
  onMergeToMain,
  onEnterFullscreen,
  onExitFullscreen,
}: {
  selectedMessageId: string | null;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  isFullscreen: boolean;
  onClose: () => void;
  onDeleteWorktree: () => void;
  onMergeToMain: () => void;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
}) {
  return (
    <div id="thread-header" className="flex items-center justify-between border-b border-[#292e42] px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-violet-300">
          {selectedMessageId ? `trace/${selectedMessageId.slice(0, 8)}` : 'Thread'}
        </h3>
        {hasWorktree === false && selectedMessageId && (
          <span className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] text-[#565f89]">
            Worktree deleted
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {hasWorktree === true && !isFullscreen && onEnterFullscreen && (
          <button
            type="button"
            title="Open fullscreen view"
            onClick={onEnterFullscreen}
            className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-violet-400/50 hover:text-violet-300"
          >
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        )}
        {isFullscreen && onExitFullscreen && (
          <button
            type="button"
            title="Exit fullscreen"
            onClick={onExitFullscreen}
            className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-violet-400/50 hover:text-violet-300"
          >
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 14h6v6" />
              <path d="M20 10h-6V4" />
              <path d="M14 10l7-7" />
              <path d="M3 21l7-7" />
            </svg>
          </button>
        )}
        {hasWorktree === true && (
          <>
            <button
              id="thread-merge-to-main"
              type="button"
              title="Merge worktree branch to main and push"
              disabled={!selectedMessageId}
              onClick={onMergeToMain}
              className="h-7 cursor-pointer rounded-md border border-[#292e42] px-2 text-xs text-[#565f89] transition-colors hover:border-green-400/50 hover:text-green-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex items-center gap-1">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M6 15V9a6 6 0 0 1 6-6h3" />
                  <path d="M15 3l3 3-3 3" />
                </svg>
                Merge
              </span>
            </button>
            <button
              id="thread-delete-worktree"
              type="button"
              title="Delete worktree for this thread"
              disabled={!selectedMessageId || deletingWorktree}
              onClick={onDeleteWorktree}
              className="h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="mx-auto h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M6 6l1 14h10l1-14" />
                <path d="M10 10v7" />
                <path d="M14 10v7" />
              </svg>
            </button>
          </>
        )}
        <button
          id="thread-close"
          type="button"
          onClick={isFullscreen && onExitFullscreen ? onExitFullscreen : onClose}
          className="cursor-pointer text-xl leading-none text-[#565f89] hover:text-[#c0caf5]"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

function ThreadStatusMessage({ status, activeThreadId }: { status: ThreadStatus; activeThreadId: string | null }) {
  if (status === 'loading') {
    return <div className="text-sm text-[#565f89]">Loading events...</div>;
  }
  if (status === 'empty') {
    return (
      <div className="text-sm text-[#565f89]">
        {activeThreadId ? 'No events yet' : 'No threads yet. Send a message to start.'}
      </div>
    );
  }
  if (status === 'error') {
    return <div className="text-sm text-red-400">Failed to load events</div>;
  }
  return null;
}

function RunButtons({ onRun }: { onRun: (planMode: boolean) => void }) {
  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRun(false)}
          className="flex-1 cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          Run
        </button>
        <button
          type="button"
          onClick={() => onRun(true)}
          className="flex-1 cursor-pointer rounded-lg border border-violet-500 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-500/20"
        >
          Run in plan mode
        </button>
      </div>
    </div>
  );
}

function ThreadInput({
  threadInput,
  isClaudeRunning,
  onThreadInputChange,
  onSendThreadMessage,
}: {
  threadInput: string;
  isClaudeRunning: boolean;
  onThreadInputChange: (value: string) => void;
  onSendThreadMessage: () => void;
}) {
  const textareaRef = useAutoResize(threadInput);

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
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
          <span className="text-xs text-violet-400">Claude is working...</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          id="thread-input"
          ref={textareaRef}
          rows={1}
          value={threadInput}
          disabled={isClaudeRunning}
          onChange={(e) => onThreadInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isClaudeRunning) onSendThreadMessage();
            }
          }}
          placeholder={isClaudeRunning ? 'Waiting for Claude...' : 'Send to Claude...'}
          className={`flex-1 resize-none rounded-lg border border-[#292e42] bg-[#1a1b26] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500 ${isClaudeRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        <button
          id="thread-send"
          type="button"
          disabled={isClaudeRunning}
          onClick={onSendThreadMessage}
          className={`cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 ${isClaudeRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Send
        </button>
      </div>
    </div>
  );
}
