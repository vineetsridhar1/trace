import { memo, useState, useRef, useEffect } from 'react';
import { FiClock, FiGitMerge, FiMaximize2, FiMinimize2, FiPlay, FiTrash2, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { TicketStatus } from '../types';
import type { ThreadInfo } from '../hooks/useThread';

type ViewMode = 'agent' | 'ticket' | 'files' | 'terminal';

const HEADER_STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Pending', className: 'text-yellow-400 bg-yellow-400/10' },
  creation: {
    label: 'Creating',
    className: 'text-orange-400 bg-orange-400/10',
  },
  in_progress: {
    label: 'In Progress',
    className: 'text-blue-400 bg-blue-400/10',
  },
  completed: {
    label: 'Completed',
    className: 'text-green-400 bg-green-400/10',
  },
  merged: {
    label: 'Merged',
    className: 'text-purple-400 bg-purple-400/10',
  },
  needs_input: {
    label: 'Needs Input',
    className: 'text-amber-400 bg-amber-400/10',
  },
  queued: {
    label: 'Queued',
    className: 'text-cyan-400 bg-cyan-400/10',
  },
  auto_review: {
    label: 'Auto-Reviewing',
    className: 'text-teal-400 bg-teal-400/10',
  },
};

interface ThreadHeaderProps {
  selectedMessageId: string | null;
  messageStatus: TicketStatus;
  hasTicket: boolean;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  scriptsAvailable: boolean;
  isFullscreen: boolean;
  onRunScripts: () => void;
  onClose: () => void;
  onDeleteWorktree: () => void;
  onMergeToMain: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
  threads: ThreadInfo[];
  activeThreadId: string | null;
  onSwitchThread: (threadId: string) => Promise<void>;
}

export const ThreadHeader = memo(function ThreadHeader({
  selectedMessageId,
  messageStatus,
  hasTicket,
  viewMode,
  onSetViewMode,
  deletingWorktree,
  hasWorktree,
  scriptsAvailable,
  isFullscreen,
  onRunScripts,
  onClose,
  onDeleteWorktree,
  onMergeToMain,
  onEnterFullscreen,
  onExitFullscreen,
  threads,
  activeThreadId,
  onSwitchThread,
}: ThreadHeaderProps) {
  const statusConfig =
    HEADER_STATUS_CONFIG[messageStatus] ?? HEADER_STATUS_CONFIG.pending;

  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [historyOpen]);

  return (
    <div
      id="thread-header"
      className="flex items-center justify-between border-b border-[#292e42] px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-violet-300">
          {selectedMessageId
            ? `trace/${selectedMessageId.slice(0, 8)}`
            : 'Thread'}
        </h3>
        {selectedMessageId && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusConfig.className}`}
          >
            {statusConfig.label}
          </span>
        )}
        <div className="flex rounded-lg bg-[#1f2335] p-0.5">
          <button
            type="button"
            onClick={() => onSetViewMode('agent')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'agent'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#565f89] hover:text-[#a9b1d6]'
            }`}
          >
            Agent
          </button>
          {hasTicket && (
            <button
              type="button"
              onClick={() => onSetViewMode('ticket')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === 'ticket'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-[#565f89] hover:text-[#a9b1d6]'
              }`}
            >
              Ticket
            </button>
          )}
          <button
            type="button"
            onClick={() => onSetViewMode('files')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'files'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#565f89] hover:text-[#a9b1d6]'
            }`}
          >
            Files
          </button>
          <button
            type="button"
            onClick={() => onSetViewMode('terminal')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'terminal'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#565f89] hover:text-[#a9b1d6]'
            }`}
          >
            Terminal
          </button>
        </div>
        {hasWorktree === false &&
          messageStatus !== 'pending' &&
          messageStatus !== 'creation' &&
          selectedMessageId && (
            <span className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] text-[#565f89]">
              Worktree deleted
            </span>
          )}
      </div>
      <div className="flex items-center gap-2">
        {threads.length > 1 && (
          <div className="relative" ref={historyRef}>
            <Tooltip text="Thread history" position="bottom">
              <button
                type="button"
                onClick={() => setHistoryOpen((prev) => !prev)}
                className={`flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs transition-colors ${
                  historyOpen
                    ? 'border-violet-400/50 text-violet-300'
                    : 'text-[#565f89] hover:border-violet-400/50 hover:text-violet-300'
                }`}
              >
                <FiClock className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
            {historyOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-[#292e42] bg-[#1a1b26] py-1 shadow-lg">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#565f89]">
                  Thread History
                </div>
                {threads.map((thread, index) => {
                  const isActive = thread.id === activeThreadId;
                  const time = new Date(thread.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => {
                        void onSwitchThread(thread.id);
                        setHistoryOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-violet-500/10 text-violet-300'
                          : 'text-[#a9b1d6] hover:bg-[#1f2335]'
                      }`}
                    >
                      <span className="font-medium">#{index + 1}</span>
                      <span className="flex-1 truncate text-[#565f89]">{time}</span>
                      <span className="text-[#565f89]">
                        {thread.eventCount} {thread.eventCount === 1 ? 'event' : 'events'}
                      </span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {hasWorktree === true && scriptsAvailable && (
          <Tooltip text="Run startup scripts" position="bottom">
            <button
              type="button"
              onClick={onRunScripts}
              className="flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-green-400/50 hover:text-green-300"
            >
              <FiPlay className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {hasWorktree === true && (messageStatus === 'in_progress' || messageStatus === 'completed' || messageStatus === 'auto_review') && (
          <Tooltip text="Merge to main" position="bottom">
            <button
              id="thread-merge-to-main"
              type="button"
              disabled={!selectedMessageId}
              onClick={onMergeToMain}
              className="flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-green-400/50 hover:text-green-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiGitMerge className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {hasWorktree === true && !isFullscreen && (
          <Tooltip text="Fullscreen" position="bottom">
            <button
              type="button"
              onClick={onEnterFullscreen}
              className="flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-violet-400/50 hover:text-violet-300"
            >
              <FiMaximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {isFullscreen && (
          <Tooltip text="Exit fullscreen" position="bottom">
            <button
              type="button"
              onClick={onExitFullscreen}
              className="flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-violet-400/50 hover:text-violet-300"
            >
              <FiMinimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {hasWorktree === true && (
          <Tooltip text="Delete worktree" position="bottom">
            <button
              id="thread-delete-worktree"
              type="button"
              disabled={!selectedMessageId || deletingWorktree}
              onClick={onDeleteWorktree}
              className="flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs text-[#565f89] transition-colors hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        <Tooltip text="Close thread" position="bottom">
          <button
            id="thread-close"
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[#565f89] hover:text-[#c0caf5]"
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
});
