import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  FiCheck,
  FiCheckCircle,
  FiFileText,
  FiGitMerge,
  FiGitPullRequest,
  FiLink,
  FiLoader,
  FiTerminal,
  FiTrash2,
  FiXCircle,
} from "react-icons/fi";
import type { Workspace, KanbanTicket, TicketStatus } from "../types";
import { getServerUrl } from "../types";
import type { PresenceUser } from "../stores/presenceStore";
import { avatarInitial } from "../utils";
import { ScrambleText } from "./ScrambleText";
import { useWorkspaceStore } from "../stores/workspaceStore";

export const STATUS_CONFIG: Record<
  TicketStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    avatarBg: string;
    avatarText: string;
  }
> = {
  pending: {
    label: "Pending",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    avatarBg: "bg-yellow-500/20",
    avatarText: "text-yellow-400",
  },
  creation: {
    label: "Creating",
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
    avatarBg: "bg-orange-500/20",
    avatarText: "text-orange-400",
  },
  in_progress: {
    label: "In Progress",
    color: "text-accent-light",
    bgColor: "bg-accent-light/10",
    avatarBg: "bg-accent",
    avatarText: "text-on-accent",
  },
  completed: {
    label: "Done",
    color: "text-green-400",
    bgColor: "bg-green-400/10",
    avatarBg: "bg-green-500/20",
    avatarText: "text-green-400",
  },
  merged: {
    label: "Merged",
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
    avatarBg: "bg-purple-500/20",
    avatarText: "text-purple-400",
  },
  needs_input: {
    label: "Needs Input",
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
    avatarBg: "bg-amber-500/20",
    avatarText: "text-amber-400",
  },
  queued: {
    label: "Queued",
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
    avatarBg: "bg-cyan-500/20",
    avatarText: "text-cyan-400",
  },
  review: {
    label: "In Review",
    color: "text-teal-400",
    bgColor: "bg-teal-400/10",
    avatarBg: "bg-teal-500/20",
    avatarText: "text-teal-400",
  },
  handed_off: {
    label: "Handed Off",
    color: "text-orange-300",
    bgColor: "bg-orange-300/10",
    avatarBg: "bg-orange-400/20",
    avatarText: "text-orange-300",
  },
};

export const STATUS_GROUP_ORDER: TicketStatus[] = [
  "needs_input",
  "queued",
  "handed_off",
  "pending",
  "creation",
  "in_progress",
  "review",
  "merged",
];

const ACTIVE_STATUSES = new Set<TicketStatus>(["in_progress", "creation"]);
const DONE_STATUSES = new Set<TicketStatus>(["completed"]);
const MARK_MERGED_STATUSES = new Set<TicketStatus>([
  "completed",
  "in_progress",
]);

function shortcutLabel(index: number): string | null {
  if (index >= 1 && index <= 9) return String(index);
  return null;
}

function StatusIcon({
  status,
  isRunning,
  workspaceId,
}: {
  status: TicketStatus;
  isRunning: boolean;
  workspaceId: string;
}) {
  const ciStatus = useWorkspaceStore((s) =>
    status === "review" ? s.ciStatuses[workspaceId] ?? null : null,
  );

  if (ACTIVE_STATUSES.has(status)) {
    return (
      <FiLoader className="h-4 w-4 flex-shrink-0 animate-spin-slow text-accent-light" />
    );
  }
  if (DONE_STATUSES.has(status)) {
    return <FiCheck className="h-4 w-4 flex-shrink-0 text-green-400" />;
  }
  if (status === "review") {
    if (ciStatus && ciStatus.total > 0) {
      if (ciStatus.failed > 0) {
        return <FiXCircle className="h-4 w-4 flex-shrink-0 text-red-400" />;
      }
      if (ciStatus.pending > 0) {
        return (
          <FiLoader className="h-4 w-4 flex-shrink-0 animate-spin-slow text-yellow-400" />
        );
      }
      if (ciStatus.passed === ciStatus.total) {
        return <FiCheckCircle className="h-4 w-4 flex-shrink-0 text-green-400" />;
      }
    }
    if (isRunning) {
      return (
        <FiLoader className="h-4 w-4 flex-shrink-0 animate-spin-slow text-teal-400" />
      );
    }
    return <FiGitPullRequest className="h-4 w-4 flex-shrink-0 text-teal-400" />;
  }
  if (status === "merged") {
    return <FiGitMerge className="h-4 w-4 flex-shrink-0 text-purple-400" />;
  }
  return null;
}

const MAX_VISIBLE_AVATARS = 3;

function PresenceAvatars({ viewers }: { viewers: PresenceUser[] }) {
  if (viewers.length === 0) return null;
  const visible = viewers.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = viewers.length - MAX_VISIBLE_AVATARS;

  return (
    <div className="flex flex-shrink-0 -space-x-1.5">
      {visible.map((v) =>
        v.avatarUrl ? (
          <img
            key={v.userId}
            src={v.avatarUrl}
            alt={v.name}
            title={v.name}
            className="h-4 w-4 rounded-full ring-1 ring-surface"
          />
        ) : (
          <div
            key={v.userId}
            title={v.name}
            className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/30 text-[8px] font-bold text-accent-light ring-1 ring-surface"
          >
            {v.name.charAt(0).toUpperCase()}
          </div>
        ),
      )}
      {overflow > 0 && (
        <div className="flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-elevated text-[8px] font-medium text-muted ring-1 ring-surface">
          +{overflow}
        </div>
      )}
    </div>
  );
}

interface MessageItemProps {
  workspace: Workspace;
  ticket: KanbanTicket | null;
  isSelected: boolean;
  needsAttention?: boolean;
  onOpenWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onMarkMerged?: (workspaceId: string) => void;
  channelId?: string | null;
  hasRunningProcess?: boolean;
  dimmed?: boolean;
  activelyRunning?: boolean;
  shortcutIndex?: number;
  viewers?: PresenceUser[];
}

export const MessageItem = memo(function MessageItem({
  workspace,
  ticket,
  isSelected,
  needsAttention,
  onOpenWorkspace,
  onDeleteWorkspace,
  onMarkMerged,
  channelId,
  hasRunningProcess,
  dimmed,
  activelyRunning,
  shortcutIndex,
  viewers,
}: MessageItemProps) {
  const status = (workspace.status ?? "pending") as TicketStatus;
  const avatarConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const title = ticket?.title || workspace.preview || "New Workspace";
  const branch = workspace.branch?.replace(/^trace\//, "");
  const todos = useWorkspaceStore((s) => s.latestTodos[workspace.id]);

  const buttonRef = useRef<HTMLButtonElement>(null);

  // ─── Context menu state ──────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  // Click-outside and Escape to close
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [ctxMenu]);

  const handleCopyLink = useCallback(async () => {
    if (!channelId) return;
    const url = `${getServerUrl()}/thread/${channelId}/${workspace.id}`;
    await navigator.clipboard.writeText(url);
    closeMenu();
  }, [channelId, workspace.id, closeMenu]);

  const handleMarkMerged = useCallback(() => {
    onMarkMerged?.(workspace.id);
    closeMenu();
  }, [onMarkMerged, workspace.id, closeMenu]);

  const handleDeleteWorkspace = useCallback(() => {
    onDeleteWorkspace?.(workspace.id);
    closeMenu();
  }, [onDeleteWorkspace, workspace.id, closeMenu]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`message-item group flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left outline-none transition-colors ${
          isSelected ? "selected" : ""
        } ${!isSelected && needsAttention ? "needs-attention" : ""} ${dimmed ? "opacity-50" : ""}`}
        onClick={() => onOpenWorkspace(workspace)}
        onContextMenu={handleContextMenu}
        title={title}
      >
        {/* Shortcut index badge */}
        {shortcutIndex != null && (
          <kbd className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded border border-edge bg-surface-deep text-[10px] font-medium leading-none text-muted">
            {shortcutLabel(shortcutIndex) ?? "\u00A0"}
          </kbd>
        )}

        {/* Avatar */}
        {workspace.isProductDoc ? (
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-light">
            <FiFileText className="h-3.5 w-3.5" />
          </div>
        ) : workspace.user?.avatarUrl ? (
          <img
            src={workspace.user.avatarUrl}
            alt={workspace.user.name}
            className={`h-6 w-6 flex-shrink-0 rounded-full ring-2 ${avatarConfig.avatarBg}`}
          />
        ) : (
          <div
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarConfig.avatarBg} ${avatarConfig.avatarText}`}
          >
            {workspace.user
              ? workspace.user.name.charAt(0).toUpperCase()
              : avatarInitial(workspace.cliSessionId)}
          </div>
        )}

        {/* Title + branch stacked */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-primary">
            <ScrambleText text={title} />
          </div>
          {branch && (
            <div className="truncate font-mono text-[10px] text-muted">
              {branch}
            </div>
          )}
        </div>

        {/* Running process indicator */}
        {hasRunningProcess && (
          <FiTerminal
            className="h-3 w-3 flex-shrink-0 text-green-400"
            title="Running process"
          />
        )}

        {/* Presence avatars */}
        {viewers && viewers.length > 0 && <PresenceAvatars viewers={viewers} />}

        {/* Status icon */}
        <StatusIcon
          status={status}
          isRunning={
            activelyRunning || workspace.cliSession.status !== "stopped"
          }
          workspaceId={workspace.id}
        />

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
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onDeleteWorkspace(workspace.id);
              }
            }}
          >
            <FiTrash2 className="h-3 w-3" />
          </div>
        )}
      </button>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-48 rounded-md border border-edge bg-surface py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {channelId && (
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated"
            >
              <FiLink className="h-3 w-3" aria-hidden="true" />
              Copy link
            </button>
          )}
          {MARK_MERGED_STATUSES.has(status) && onMarkMerged && (
            <button
              type="button"
              onClick={handleMarkMerged}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-surface-elevated"
            >
              <FiCheck className="h-3 w-3" aria-hidden="true" />
              Mark as merged
            </button>
          )}
          <div className="my-1 h-px bg-surface-elevated" />
          <button
            type="button"
            onClick={handleDeleteWorkspace}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-surface-elevated"
          >
            <FiTrash2 className="h-3 w-3" aria-hidden="true" />
            Delete workspace
          </button>
        </div>
      )}

    </>
  );
}, areMessageItemPropsEqual);

function areMessageItemPropsEqual(
  prev: MessageItemProps,
  next: MessageItemProps,
) {
  return (
    prev.workspace === next.workspace &&
    prev.ticket === next.ticket &&
    prev.isSelected === next.isSelected &&
    prev.needsAttention === next.needsAttention &&
    prev.dimmed === next.dimmed &&
    prev.hasRunningProcess === next.hasRunningProcess &&
    prev.onOpenWorkspace === next.onOpenWorkspace &&
    prev.onDeleteWorkspace === next.onDeleteWorkspace &&
    prev.onMarkMerged === next.onMarkMerged &&
    prev.channelId === next.channelId &&
    prev.shortcutIndex === next.shortcutIndex &&
    prev.viewers === next.viewers
  );
}
