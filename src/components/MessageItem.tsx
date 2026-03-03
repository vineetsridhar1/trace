import { memo } from 'react';
import { FiCheck, FiGitMerge, FiGitPullRequest, FiLoader, FiTerminal, FiTrash2 } from 'react-icons/fi';
import type { Workspace, KanbanTicket, TicketStatus } from '../types';
import { avatarInitial } from '../utils';
import { ScrambleText } from './ScrambleText';

export const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bgColor: string; avatarBg: string; avatarText: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-400', bgColor: 'bg-yellow-400/10', avatarBg: 'bg-yellow-500/20', avatarText: 'text-yellow-400' },
  creation: { label: 'Creating', color: 'text-orange-400', bgColor: 'bg-orange-400/10', avatarBg: 'bg-orange-500/20', avatarText: 'text-orange-400' },
  in_progress: { label: 'In Progress', color: 'text-accent-light', bgColor: 'bg-accent-light/10', avatarBg: 'bg-accent', avatarText: 'text-on-accent' },
  completed: { label: 'Done', color: 'text-green-400', bgColor: 'bg-green-400/10', avatarBg: 'bg-green-500/20', avatarText: 'text-green-400' },
  merged: { label: 'Merged', color: 'text-purple-400', bgColor: 'bg-purple-400/10', avatarBg: 'bg-purple-500/20', avatarText: 'text-purple-400' },
  needs_input: { label: 'Needs Input', color: 'text-amber-400', bgColor: 'bg-amber-400/10', avatarBg: 'bg-amber-500/20', avatarText: 'text-amber-400' },
  queued: { label: 'Queued', color: 'text-cyan-400', bgColor: 'bg-cyan-400/10', avatarBg: 'bg-cyan-500/20', avatarText: 'text-cyan-400' },
  review: { label: 'In Review', color: 'text-teal-400', bgColor: 'bg-teal-400/10', avatarBg: 'bg-teal-500/20', avatarText: 'text-teal-400' },
  handed_off: { label: 'Handed Off', color: 'text-orange-300', bgColor: 'bg-orange-300/10', avatarBg: 'bg-orange-400/20', avatarText: 'text-orange-300' },
};

export const STATUS_GROUP_ORDER: TicketStatus[] = [
  'needs_input',
  'queued',
  'handed_off',
  'pending',
  'creation',
  'in_progress',
  'review',
  'merged',
];

const ACTIVE_STATUSES = new Set<TicketStatus>(['in_progress', 'creation']);
const DONE_STATUSES = new Set<TicketStatus>(['completed']);

function shortcutLabel(index: number): string | null {
  if (index >= 1 && index <= 9) return String(index);
  return null;
}

function StatusIcon({ status, isRunning }: { status: TicketStatus; isRunning: boolean }) {
  if (ACTIVE_STATUSES.has(status)) {
    return <FiLoader className="h-4 w-4 flex-shrink-0 animate-spin-slow text-accent-light" />;
  }
  if (DONE_STATUSES.has(status)) {
    return <FiCheck className="h-4 w-4 flex-shrink-0 text-green-400" />;
  }
  if (status === 'review') {
    if (isRunning) {
      return <FiLoader className="h-4 w-4 flex-shrink-0 animate-spin-slow text-teal-400" />;
    }
    return <FiGitPullRequest className="h-4 w-4 flex-shrink-0 text-teal-400" />;
  }
  if (status === 'merged') {
    return <FiGitMerge className="h-4 w-4 flex-shrink-0 text-purple-400" />;
  }
  return null;
}

interface MessageItemProps {
  workspace: Workspace;
  ticket: KanbanTicket | null;
  isSelected: boolean;
  needsAttention?: boolean;
  onOpenWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onDeleteWorktree?: (workspaceId: string) => void;
  hasActiveWorktree?: boolean;
  hasRunningProcess?: boolean;
  isDeletingWorktree?: boolean;
  dimmed?: boolean;
  activelyRunning?: boolean;
  shortcutIndex?: number;
}

export const MessageItem = memo(function MessageItem({
  workspace,
  ticket,
  isSelected,
  needsAttention,
  onOpenWorkspace,
  onDeleteWorkspace,
  onDeleteWorktree,
  hasActiveWorktree,
  hasRunningProcess,
  isDeletingWorktree,
  dimmed,
  activelyRunning,
  shortcutIndex,
}: MessageItemProps) {
  const status = (workspace.status ?? 'pending') as TicketStatus;
  const avatarConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const title = ticket?.title || workspace.preview || workspace.cliSessionId;
  const branch = workspace.branch?.replace(/^trace\//, '');

  return (
    <button
      type="button"
      className={`message-item group flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left outline-none transition-colors ${
        isSelected ? 'selected' : ''
      } ${!isSelected && needsAttention ? 'needs-attention' : ''} ${dimmed ? 'opacity-50' : ''}`}
      onClick={() => onOpenWorkspace(workspace)}
      title={title}
    >
      {/* Shortcut index badge */}
      {shortcutIndex != null && (
        <kbd className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded border border-edge bg-surface-deep text-[10px] font-medium leading-none text-muted">
          {shortcutLabel(shortcutIndex) ?? '\u00A0'}
        </kbd>
      )}

      {/* Avatar */}
      {workspace.user?.avatarUrl ? (
        <img
          src={workspace.user.avatarUrl}
          alt={workspace.user.name}
          className={`h-6 w-6 flex-shrink-0 rounded-full ring-2 ${avatarConfig.avatarBg}`}
        />
      ) : (
        <div
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarConfig.avatarBg} ${avatarConfig.avatarText}`}
        >
          {workspace.user ? workspace.user.name.charAt(0).toUpperCase() : avatarInitial(workspace.cliSessionId)}
        </div>
      )}

      {/* Title + branch stacked */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-primary"><ScrambleText text={title} /></div>
        {branch && (
          <div className="truncate font-mono text-[10px] text-muted">{branch}</div>
        )}
      </div>

      {/* Running process indicator */}
      {hasRunningProcess && (
        <FiTerminal className="h-3 w-3 flex-shrink-0 text-green-400" title="Running process" />
      )}

      {/* Status icon */}
      <StatusIcon status={status} isRunning={activelyRunning || workspace.cliSession.status !== 'stopped'} />

      {/* Delete worktree button for merged items with active worktrees */}
      {hasActiveWorktree && onDeleteWorktree && (
        isDeletingWorktree ? (
          <div title="Deleting worktree" className="flex-shrink-0 p-0.5 text-muted">
            <FiLoader className="h-3 w-3 animate-spin" />
          </div>
        ) : (
          <div
            role="button"
            tabIndex={-1}
            title="Delete worktree"
            className="flex-shrink-0 cursor-pointer rounded p-0.5 text-muted hover:bg-red-500/20 hover:text-red-400 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteWorktree(workspace.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onDeleteWorktree(workspace.id);
              }
            }}
          >
            <FiTrash2 className="h-3 w-3" />
          </div>
        )
      )}

      {/* Delete button (hover only) */}
      {onDeleteWorkspace && (
        <div
          role="button"
          tabIndex={-1}
          className="hidden flex-shrink-0 cursor-pointer rounded p-0.5 text-muted hover:bg-red-500/20 hover:text-red-400 transition-colors group-hover:block"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteWorkspace(workspace.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onDeleteWorkspace(workspace.id);
            }
          }}
        >
          <FiTrash2 className="h-3 w-3" />
        </div>
      )}
    </button>
  );
}, areMessageItemPropsEqual);

function areMessageItemPropsEqual(prev: MessageItemProps, next: MessageItemProps) {
  return (
    prev.workspace === next.workspace &&
    prev.ticket === next.ticket &&
    prev.isSelected === next.isSelected &&
    prev.needsAttention === next.needsAttention &&
    prev.dimmed === next.dimmed &&
    prev.hasActiveWorktree === next.hasActiveWorktree &&
    prev.hasRunningProcess === next.hasRunningProcess &&
    prev.isDeletingWorktree === next.isDeletingWorktree &&
    prev.onOpenWorkspace === next.onOpenWorkspace &&
    prev.onDeleteWorkspace === next.onDeleteWorkspace &&
    prev.onDeleteWorktree === next.onDeleteWorktree &&
    prev.shortcutIndex === next.shortcutIndex
  );
}
