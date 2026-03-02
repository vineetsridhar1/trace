import { memo, useState, useRef, useEffect } from 'react';
import { FiCheck, FiClock, FiCopy, FiExternalLink, FiLoader, FiMaximize2, FiMinimize2, FiMoreVertical, FiShare2, FiTrash2, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { TicketStatus } from '../types';
import type { SessionInfo } from '../hooks/useThread';

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
    label: 'Done',
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
  review: {
    label: 'In Review',
    className: 'text-teal-400 bg-teal-400/10',
  },
};

interface ThreadHeaderProps {
  selectedWorkspaceId: string | null;
  workspaceStatus: TicketStatus;
  isClaudeRunning: boolean;
  hasTicket: boolean;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  worktreePath: string | null;
  isFullscreen: boolean;
  onClose: () => void;
  onDeleteWorktree: () => void;
  onMarkMerged: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
  canHandoff: boolean;
  onHandoff: () => void;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSwitchSession: (sessionId: string) => Promise<void>;
}

export const ThreadHeader = memo(function ThreadHeader({
  selectedWorkspaceId,
  workspaceStatus,
  isClaudeRunning,
  hasTicket,
  viewMode,
  onSetViewMode,
  deletingWorktree,
  hasWorktree,
  worktreePath,
  isFullscreen,
  onClose,
  onDeleteWorktree,
  onMarkMerged,
  onEnterFullscreen,
  onExitFullscreen,
  canHandoff,
  onHandoff,
  sessions,
  activeSessionId,
  onSwitchSession,
}: ThreadHeaderProps) {
  const statusConfig =
    HEADER_STATUS_CONFIG[workspaceStatus] ?? HEADER_STATUS_CONFIG.pending;

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

  // ─── Open In dropdown ──────────────────────────────────────────
  const [openInOpen, setOpenInOpen] = useState(false);
  const [installedApps, setInstalledApps] = useState<Array<{ id: string; label: string }> | null>(null);
  const openInRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openInOpen || installedApps !== null) return;
    void (async () => {
      try {
        const result = await window.traceAPI.detectInstalledApps();
        setInstalledApps(result.success && result.apps.length > 0
          ? result.apps
          : [{ id: 'finder', label: 'Finder' }, { id: 'terminal', label: 'Terminal' }]);
      } catch {
        setInstalledApps([{ id: 'finder', label: 'Finder' }, { id: 'terminal', label: 'Terminal' }]);
      }
    })();
  }, [openInOpen, installedApps]);

  useEffect(() => {
    if (!openInOpen) return;
    const handleClickOutsideOpenIn = (e: MouseEvent) => {
      if (openInRef.current && !openInRef.current.contains(e.target as Node)) {
        setOpenInOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideOpenIn);
    return () => document.removeEventListener('mousedown', handleClickOutsideOpenIn);
  }, [openInOpen]);

  const handleOpenInApp = async (appId: string) => {
    if (!worktreePath) return;
    if (appId === 'copy-path') {
      await navigator.clipboard.writeText(worktreePath);
    } else {
      await window.traceAPI.openInApp(appId, worktreePath);
    }
    setOpenInOpen(false);
  };

  // ─── Three-dot overflow menu ──────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutsideMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideMenu);
    return () => document.removeEventListener('mousedown', handleClickOutsideMenu);
  }, [menuOpen]);

  const hasMenuItems = hasWorktree === true || isFullscreen || workspaceStatus === 'completed' || canHandoff;

  return (
    <div
      id="thread-header"
      className="flex items-center justify-between border-b border-[#292e42] px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-violet-300">
          {selectedWorkspaceId
            ? `trace/${selectedWorkspaceId.slice(0, 8)}`
            : 'Thread'}
        </h3>
        {selectedWorkspaceId && (
          <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${statusConfig.className}`}
          >
            {workspaceStatus === 'review' && isClaudeRunning && (
              <FiLoader className="h-3 w-3 animate-spin-slow" />
            )}
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
          workspaceStatus !== 'pending' &&
          workspaceStatus !== 'creation' &&
          selectedWorkspaceId && (
            <span className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] text-[#565f89]">
              Worktree deleted
            </span>
          )}
      </div>
      <div className="flex items-center gap-2">
        {sessions.length > 1 && (
          <div className="relative" ref={historyRef}>
            <Tooltip text="Session history" position="bottom">
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
                  Session History
                </div>
                {sessions.map((session, index) => {
                  const isActive = session.id === activeSessionId;
                  const time = new Date(session.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        void onSwitchSession(session.id);
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
                        {session.eventCount} {session.eventCount === 1 ? 'event' : 'events'}
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
        {hasWorktree === true && worktreePath && (
          <div className="relative" ref={openInRef}>
            <Tooltip text="Open in…" position="bottom">
              <button
                type="button"
                onClick={() => setOpenInOpen((prev) => !prev)}
                className={`flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs transition-colors ${
                  openInOpen
                    ? 'border-violet-400/50 text-violet-300'
                    : 'text-[#565f89] hover:border-violet-400/50 hover:text-violet-300'
                }`}
              >
                <FiExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
            {openInOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[#292e42] bg-[#1a1b26] py-1 shadow-lg">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#565f89]">
                  Open In
                </div>
                {installedApps === null ? (
                  <div className="flex items-center justify-center py-3">
                    <FiLoader className="h-3.5 w-3.5 animate-spin text-[#565f89]" />
                  </div>
                ) : (
                  <>
                    {installedApps.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => void handleOpenInApp(app.id)}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-[#a9b1d6] transition-colors hover:bg-[#1f2335]"
                      >
                        {app.label}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-[#292e42]" />
                    <button
                      type="button"
                      onClick={() => void handleOpenInApp('copy-path')}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-[#a9b1d6] transition-colors hover:bg-[#1f2335]"
                    >
                      <FiCopy className="h-3 w-3" aria-hidden="true" />
                      Copy path
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {hasMenuItems && (
          <div className="relative" ref={menuRef}>
            <Tooltip text="More actions" position="bottom">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className={`flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-[#292e42] text-xs transition-colors ${
                  menuOpen
                    ? 'border-violet-400/50 text-violet-300'
                    : 'text-[#565f89] hover:border-violet-400/50 hover:text-violet-300'
                }`}
              >
                <FiMoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[#292e42] bg-[#1a1b26] py-1 shadow-lg">
                {canHandoff && (
                  <button
                    type="button"
                    onClick={() => { onHandoff(); setMenuOpen(false); }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-400 transition-colors hover:bg-[#1f2335]"
                  >
                    <FiShare2 className="h-3 w-3" aria-hidden="true" />
                    Hand off
                  </button>
                )}
                {hasWorktree === true && !isFullscreen && (
                  <button
                    type="button"
                    onClick={() => { onEnterFullscreen(); setMenuOpen(false); }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-[#a9b1d6] transition-colors hover:bg-[#1f2335]"
                  >
                    <FiMaximize2 className="h-3 w-3" aria-hidden="true" />
                    Fullscreen
                  </button>
                )}
                {isFullscreen && (
                  <button
                    type="button"
                    onClick={() => { onExitFullscreen(); setMenuOpen(false); }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-[#a9b1d6] transition-colors hover:bg-[#1f2335]"
                  >
                    <FiMinimize2 className="h-3 w-3" aria-hidden="true" />
                    Exit fullscreen
                  </button>
                )}
                {workspaceStatus === 'completed' && (
                  <button
                    type="button"
                    disabled={!selectedWorkspaceId}
                    onClick={() => { onMarkMerged(); setMenuOpen(false); }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-[#a9b1d6] transition-colors hover:bg-[#1f2335] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FiCheck className="h-3 w-3" aria-hidden="true" />
                    Mark as merged
                  </button>
                )}
                {hasWorktree === true && (
                  <>
                    <div className="my-1 h-px bg-[#292e42]" />
                    <button
                      type="button"
                      disabled={!selectedWorkspaceId || deletingWorktree}
                      onClick={() => { onDeleteWorktree(); setMenuOpen(false); }}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-[#1f2335] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deletingWorktree
                        ? <FiLoader className="h-3 w-3 animate-spin" aria-hidden="true" />
                        : <FiTrash2 className="h-3 w-3" aria-hidden="true" />}
                      {deletingWorktree ? 'Deleting worktree...' : 'Delete worktree'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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
