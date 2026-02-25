import { FiGitMerge, FiMaximize2, FiMinimize2, FiPlay, FiTrash2, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { TokenUsageBadge } from './TokenUsageBadge';
import type { ServerEvent, TicketStatus } from '../types';

type ViewMode = 'agent' | 'ticket';

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
  onRunScripts: () => void;
  isFullscreen: boolean;
  onClose: () => void;
  onDeleteWorktree: () => void;
  onMergeToMain: () => void;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  threadEvents: ServerEvent[];
}

export function ThreadHeader({
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
  threadEvents,
}: ThreadHeaderProps) {
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
            : 'Thread'}
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
              onClick={() => onSetViewMode('agent')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === 'agent'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-[#565f89] hover:text-[#a9b1d6]'
              }`}
            >
              Agent
            </button>
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
          </div>
        )}
        {hasWorktree === false &&
          messageStatus !== 'pending' &&
          messageStatus !== 'creation' &&
          selectedMessageId && (
            <span className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] text-[#565f89]">
              Worktree deleted
            </span>
          )}
        <TokenUsageBadge events={threadEvents} />
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
        {hasWorktree === true && messageStatus === 'in_progress' && (
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
