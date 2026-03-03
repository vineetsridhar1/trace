import { memo, useState, useRef, useEffect } from "react";
import {
  FiCheck,
  FiClock,
  FiCopy,
  FiExternalLink,
  FiGitPullRequest,
  FiLink,
  FiLoader,
  FiMaximize2,
  FiMinimize2,
  FiMoreVertical,
  FiShare2,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { Tooltip } from "./Tooltip";
import type { TicketStatus } from "../types";
import { getServerUrl } from "../types";
import type { SessionInfo } from "../hooks/useThread";
import type { CIStatus } from "../stores/workspaceStore";
import { useThreadStore, type ThreadViewMode } from "../stores/threadStore";
import { formatTokenCount } from "../utils";

type ViewMode = ThreadViewMode;

interface ThreadHeaderProps {
  selectedWorkspaceId: string | null;
  channelId: string | null;
  workspaceStatus: TicketStatus;
  hasTicket: boolean;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  worktreePath: string | null;
  isFullscreen: boolean;
  onClose: () => void;
  onDeleteWorkspace: () => void;
  onDeleteWorktree: () => void;
  onMarkMerged: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
  canHandoff: boolean;
  handingOff: boolean;
  onHandoff: () => void;
  prUrl: string | null;
  ciStatus: CIStatus | null;
  canCreatePR: boolean;
  onCreatePR: () => void;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSwitchSession: (sessionId: string) => Promise<void>;
}

export const ThreadHeader = memo(function ThreadHeader({
  selectedWorkspaceId,
  channelId,
  workspaceStatus,
  hasTicket,
  viewMode,
  onSetViewMode,
  deletingWorktree,
  hasWorktree,
  worktreePath,
  isFullscreen,
  onClose,
  onDeleteWorkspace,
  onDeleteWorktree,
  onMarkMerged,
  onEnterFullscreen,
  onExitFullscreen,
  canHandoff,
  handingOff,
  onHandoff,
  prUrl,
  ciStatus,
  canCreatePR,
  onCreatePR,
  sessions,
  activeSessionId,
  onSwitchSession,
}: ThreadHeaderProps) {
  const tokenUsage = useThreadStore((s) => s.tokenUsage);

  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyOpen]);

  // ─── Open In dropdown ──────────────────────────────────────────
  const [openInOpen, setOpenInOpen] = useState(false);
  const [installedApps, setInstalledApps] = useState<Array<{
    id: string;
    label: string;
  }> | null>(null);
  const openInRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openInOpen || installedApps !== null) return;
    void (async () => {
      try {
        const result = await window.traceAPI.detectInstalledApps();
        setInstalledApps(
          result.success && result.apps.length > 0
            ? result.apps
            : [
                { id: "finder", label: "Finder" },
                { id: "terminal", label: "Terminal" },
              ],
        );
      } catch {
        setInstalledApps([
          { id: "finder", label: "Finder" },
          { id: "terminal", label: "Terminal" },
        ]);
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
    document.addEventListener("mousedown", handleClickOutsideOpenIn);
    return () =>
      document.removeEventListener("mousedown", handleClickOutsideOpenIn);
  }, [openInOpen]);

  const handleOpenInApp = async (appId: string) => {
    if (!worktreePath) return;
    if (appId === "copy-path") {
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
    document.addEventListener("mousedown", handleClickOutsideMenu);
    return () =>
      document.removeEventListener("mousedown", handleClickOutsideMenu);
  }, [menuOpen]);

  const handleCopyLink = async () => {
    if (!channelId || !selectedWorkspaceId) return;
    const url = `${getServerUrl()}/thread/${channelId}/${selectedWorkspaceId}`;
    await navigator.clipboard.writeText(url);
  };

  const hasMenuItems =
    selectedWorkspaceId !== null ||
    hasWorktree === true ||
    isFullscreen ||
    workspaceStatus === "completed" ||
    canHandoff;

  return (
    <div
      id="thread-header"
      className="flex items-center justify-between border-b border-edge px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-surface-elevated p-0.5">
          <Tooltip text="⌘1">
            <button
              type="button"
              onClick={() => onSetViewMode("agent")}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "agent"
                  ? "bg-accent/20 text-accent-light"
                  : "text-muted hover:text-primary"
              }`}
            >
              Agent
            </button>
          </Tooltip>
          {hasTicket && (
            <Tooltip text="⌘2">
              <button
                type="button"
                onClick={() => onSetViewMode("ticket")}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "ticket"
                    ? "bg-accent/20 text-accent-light"
                    : "text-muted hover:text-primary"
                }`}
              >
                Ticket
              </button>
            </Tooltip>
          )}
          <Tooltip text="⌘3">
            <button
              type="button"
              onClick={() => onSetViewMode("files")}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "files"
                  ? "bg-accent/20 text-accent-light"
                  : "text-muted hover:text-primary"
              }`}
            >
              Files
            </button>
          </Tooltip>
          <Tooltip text={hasWorktree !== true ? "Worktree deleted" : "⌘4"}>
            <button
              type="button"
              disabled={hasWorktree !== true}
              onClick={() => onSetViewMode("terminal")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                hasWorktree !== true
                  ? "opacity-40 cursor-not-allowed text-muted"
                  : viewMode === "terminal"
                    ? "cursor-pointer bg-accent/20 text-accent-light"
                    : "cursor-pointer text-muted hover:text-primary"
              }`}
            >
              Terminal
            </button>
          </Tooltip>
          <Tooltip text={hasWorktree !== true ? "Worktree deleted" : "⌘5"}>
            <button
              type="button"
              disabled={hasWorktree !== true}
              onClick={() => onSetViewMode("browser")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                hasWorktree !== true
                  ? "opacity-40 cursor-not-allowed text-[#565f89]"
                  : viewMode === "browser"
                    ? "cursor-pointer bg-violet-500/20 text-violet-300"
                    : "cursor-pointer text-[#565f89] hover:text-[#a9b1d6]"
              }`}
            >
              Browser
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {tokenUsage && tokenUsage.totalTokens > 0 && (
          <Tooltip
            text={
              <div className="w-48 whitespace-normal">
                <div className="border-b border-edge pb-1.5 mb-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted">Input</span>
                    <span>{tokenUsage.inputTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Output</span>
                    <span>{tokenUsage.outputTokens.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Cost</span>
                  <span>
                    {tokenUsage.cliCostUsd != null
                      ? `$${tokenUsage.cliCostUsd.toFixed(2)}`
                      : "\u2014"}
                  </span>
                </div>
              </div>
            }
            position="bottom"
          >
            <span className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-muted">
              {formatTokenCount(tokenUsage.totalTokens)} tokens
              {tokenUsage.cliCostUsd != null && (
                <span className="text-muted/70">
                  &middot; ${tokenUsage.cliCostUsd.toFixed(2)}
                </span>
              )}
            </span>
          </Tooltip>
        )}
        {prUrl
          ? (() => {
              const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
              let colorClass = "text-green-400 border-green-400/50";
              let tooltip = "Open pull request";
              if (ciStatus) {
                if (ciStatus.failed > 0) {
                  colorClass = "text-red-400 border-red-400/50";
                  tooltip = `${ciStatus.failed} check${ciStatus.failed === 1 ? "" : "s"} failed`;
                } else if (ciStatus.pending > 0) {
                  colorClass = "text-yellow-400 border-yellow-400/50";
                  tooltip = `${ciStatus.pending} check${ciStatus.pending === 1 ? "" : "s"} pending`;
                } else if (
                  ciStatus.total > 0 &&
                  ciStatus.passed === ciStatus.total
                ) {
                  colorClass = "text-green-400 border-green-400/50";
                  tooltip = `All ${ciStatus.total} checks passed`;
                }
              }
              return (
                <Tooltip text={tooltip} position="bottom">
                  <button
                    type="button"
                    onClick={() => window.open(prUrl, "_blank")}
                    className={`inline-flex items-center gap-1.5 cursor-pointer rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/5 ${colorClass}`}
                  >
                    <FiGitPullRequest className="h-3 w-3" aria-hidden="true" />
                    {prNumber ? `PR #${prNumber}` : "PR"}
                    <FiExternalLink
                      className="h-2.5 w-2.5"
                      aria-hidden="true"
                    />
                  </button>
                </Tooltip>
              );
            })()
          : canCreatePR && (
              <Tooltip text="Create pull request" position="bottom">
                <button
                  type="button"
                  onClick={onCreatePR}
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-[#565f89]/50 px-2 py-1 text-[11px] font-medium text-[#565f89] transition-colors hover:border-violet-400/50 hover:text-violet-300 hover:bg-white/5"
                >
                  <FiGitPullRequest className="h-3 w-3" aria-hidden="true" />
                  Create PR
                </button>
              </Tooltip>
            )}
        {sessions.length > 1 && (
          <div className="relative" ref={historyRef}>
            <Tooltip text="Session history" position="bottom">
              <button
                type="button"
                onClick={() => setHistoryOpen((prev) => !prev)}
                className={`flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-edge text-xs transition-colors ${
                  historyOpen
                    ? "border-accent-light/50 text-accent-light"
                    : "text-muted hover:border-accent-light/50 hover:text-accent-light"
                }`}
              >
                <FiClock className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
            {historyOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-edge bg-surface py-1 shadow-lg">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Session History
                </div>
                {sessions.map((session, index) => {
                  const isActive = session.id === activeSessionId;
                  const time = new Date(session.createdAt).toLocaleTimeString(
                    [],
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  );
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
                          ? "bg-accent/10 text-accent-light"
                          : "text-primary hover:bg-surface-elevated"
                      }`}
                    >
                      <span className="font-medium">#{index + 1}</span>
                      <span className="flex-1 truncate text-muted">{time}</span>
                      <span className="text-muted">
                        {session.eventCount}{" "}
                        {session.eventCount === 1 ? "event" : "events"}
                      </span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-light" />
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
                className={`flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-edge text-xs transition-colors ${
                  openInOpen
                    ? "border-accent-light/50 text-accent-light"
                    : "text-muted hover:border-accent-light/50 hover:text-accent-light"
                }`}
              >
                <FiExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
            {openInOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-edge bg-surface py-1 shadow-lg">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Open In
                </div>
                {installedApps === null ? (
                  <div className="flex items-center justify-center py-3">
                    <FiLoader className="h-3.5 w-3.5 animate-spin text-muted" />
                  </div>
                ) : (
                  <>
                    {installedApps.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => void handleOpenInApp(app.id)}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated"
                      >
                        {app.label}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-surface-elevated" />
                    <button
                      type="button"
                      onClick={() => void handleOpenInApp("copy-path")}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated"
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
            {handingOff ? (
              <Tooltip text="Handing off..." position="bottom">
                <div className="flex items-center justify-center h-7 w-7 rounded-md border border-amber-400/50 text-amber-400">
                  <FiLoader
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                </div>
              </Tooltip>
            ) : (
              <Tooltip text="More actions" position="bottom">
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className={`flex items-center justify-center h-7 w-7 cursor-pointer rounded-md border border-edge text-xs transition-colors ${
                    menuOpen
                      ? "border-accent-light/50 text-accent-light"
                      : "text-muted hover:border-accent-light/50 hover:text-accent-light"
                  }`}
                >
                  <FiMoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-edge bg-surface py-1 shadow-lg">
                {selectedWorkspaceId && channelId && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyLink();
                      setMenuOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated"
                  >
                    <FiLink className="h-3 w-3" aria-hidden="true" />
                    Copy link
                  </button>
                )}
                {canHandoff && (
                  <button
                    type="button"
                    onClick={() => {
                      onHandoff();
                      setMenuOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-400 transition-colors hover:bg-surface-elevated"
                  >
                    <FiShare2 className="h-3 w-3" aria-hidden="true" />
                    Hand off
                  </button>
                )}
                {hasWorktree === true && !isFullscreen && (
                  <button
                    type="button"
                    onClick={() => {
                      onEnterFullscreen();
                      setMenuOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated"
                  >
                    <FiMaximize2 className="h-3 w-3" aria-hidden="true" />
                    Fullscreen
                  </button>
                )}
                {isFullscreen && (
                  <button
                    type="button"
                    onClick={() => {
                      onExitFullscreen();
                      setMenuOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated"
                  >
                    <FiMinimize2 className="h-3 w-3" aria-hidden="true" />
                    Exit fullscreen
                  </button>
                )}
                {workspaceStatus === "completed" && (
                  <button
                    type="button"
                    disabled={!selectedWorkspaceId}
                    onClick={() => {
                      onMarkMerged();
                      setMenuOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FiCheck className="h-3 w-3" aria-hidden="true" />
                    Mark as merged
                  </button>
                )}
                {hasWorktree === true && (
                  <>
                    <div className="my-1 h-px bg-surface-elevated" />
                    <button
                      type="button"
                      disabled={!selectedWorkspaceId || deletingWorktree}
                      onClick={() => {
                        onDeleteWorktree();
                        setMenuOpen(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deletingWorktree ? (
                        <FiLoader
                          className="h-3 w-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <FiTrash2 className="h-3 w-3" aria-hidden="true" />
                      )}
                      {deletingWorktree
                        ? "Deleting worktree..."
                        : "Delete worktree"}
                    </button>
                  </>
                )}
                <div className="my-1 h-px bg-surface-elevated" />
                <button
                  type="button"
                  disabled={!selectedWorkspaceId}
                  onClick={() => {
                    onDeleteWorkspace();
                    setMenuOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FiTrash2 className="h-3 w-3" aria-hidden="true" />
                  Delete workspace
                </button>
              </div>
            )}
          </div>
        )}
        <Tooltip text="Close thread" position="bottom">
          <button
            id="thread-close"
            type="button"
            onClick={onClose}
            className="cursor-pointer text-muted hover:text-primary"
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
});
