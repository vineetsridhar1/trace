import {
  FiMessageSquare,
  FiCheckSquare,
  FiFolder,
  FiFileText,
  FiGitPullRequest,
  FiMessageCircle,
  FiCpu,
  FiTerminal,
  FiGitBranch,
} from 'react-icons/fi';
import type { GlobalTab, GlobalTabType } from '../stores/tabStore';
import { TAB_LABELS } from '../stores/tabStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { STATUS_CONFIG } from './MessageItem';
import type { TicketStatus } from '../types';

const GAP = 6;

const TAB_ICONS: Record<GlobalTabType, typeof FiMessageSquare> = {
  thread: FiCpu,
  chat: FiMessageSquare,
  board: FiCheckSquare,
  projects: FiFolder,
  documents: FiFileText,
  'pull-requests': FiGitPullRequest,
  'ai-chat': FiMessageCircle,
  terminal: FiTerminal,
};

interface TabPopoverProps {
  tab: GlobalTab;
  triggerRect: DOMRect;
}

export function TabPopover({ tab, triggerRect }: TabPopoverProps) {
  const Icon = TAB_ICONS[tab.type];
  const workspace = useWorkspaceStore((s) =>
    tab.workspaceId ? s.workspaces.find((w) => w.id === tab.workspaceId) : undefined,
  );

  // Position below the tab
  const top = triggerRect.bottom + GAP;

  // Horizontally center on the trigger, clamp to viewport
  const popoverWidth = 240;
  const idealLeft = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;
  const left = Math.max(4, Math.min(idealLeft, window.innerWidth - popoverWidth - 4));

  const title = workspace?.ticketTitle || workspace?.preview || tab.label;
  const status = workspace?.status as TicketStatus | undefined;
  const statusConfig = status ? STATUS_CONFIG[status] ?? STATUS_CONFIG.pending : null;
  const branch = workspace?.branch?.replace(/^trace\//, '');

  return (
    <div
      className="pointer-events-none fixed z-[9999] w-60 animate-fade-in rounded-md border border-edge bg-surface-elevated/75 p-3 shadow-lg backdrop-blur-md"
      style={{ top, left }}
    >
      {/* Type badge with icon */}
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-accent-light" aria-hidden="true" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {TAB_LABELS[tab.type]}
        </span>
      </div>

      {/* Title */}
      <h4 className="mt-1.5 text-sm font-medium text-primary">{title}</h4>

      {/* Status badge for thread tabs */}
      {statusConfig && (
        <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${statusConfig.color} ${statusConfig.bgColor}`}>
          {statusConfig.label}
        </span>
      )}

      {/* Channel */}
      {tab.channelName && (
        <div className="mt-1.5 text-xs text-muted">
          <span className="text-muted/60">Channel:</span>{' '}
          <span className="text-primary/80">#{tab.channelName}</span>
        </div>
      )}

      {/* Branch */}
      {branch && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <FiGitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono text-[10px] text-primary/80">{branch}</span>
        </div>
      )}

      {/* Summary */}
      {workspace?.summary && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted">{workspace.summary}</p>
      )}
    </div>
  );
}
