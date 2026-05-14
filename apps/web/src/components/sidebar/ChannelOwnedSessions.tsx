import { memo, useCallback, useMemo, useState, type KeyboardEvent } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  GitPullRequest,
  Link2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  useAuthStore,
  useEntityField,
  useEntityIds,
  useEntityStore,
  getSessionChannelId,
} from "@trace/client-core";
import type { AuthState, EntityState, EntityTableMap } from "@trace/client-core";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import {
  getDisplayAgentStatus,
  getDisplaySessionStatus,
  sessionStatusColor,
  sessionStatusLabel,
} from "../session/sessionStatus";
import { sessionStatusGroupOrder } from "../channel/sessions-table-types";
import { useUIStore, type UIState } from "../../stores/ui";
import { cn, timeAgo } from "../../lib/utils";
import { sidebarNestedFullWidthRowClass } from "./sidebarItemStyles";
import { SidebarSessionHoverCard } from "./SidebarSessionHoverCard";
import { ArchiveSessionGroupDialog } from "../session/ArchiveSessionGroupDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";

type SessionGroupRef = {
  channel?: { id: string } | null;
  archivedAt?: string | null;
  status?: string | null;
} | null;

export type SidebarSessionScope = "mine" | "all";

type SidebarSessionRecord = {
  id: string;
  name: string;
  sortTimestamp: string;
  status: string;
};

type SidebarSessionStatusGroup = {
  status: string;
  sessionIds: string[];
};

function getSidebarSessionChannelId(session: EntityTableMap["sessions"]): string | null {
  return (
    getSessionChannelId(session) ??
    ((session.sessionGroup as SessionGroupRef | undefined)?.channel?.id ?? null)
  );
}

export function useSidebarSessionIdsForChannel(
  channelId: string,
  scope: SidebarSessionScope,
): string[] {
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  return useEntityIds(
    "sessions",
    (session) => {
      const sessionGroup = session.sessionGroup as SessionGroupRef | undefined;
      return (
        (scope === "all" || (Boolean(userId) && session.createdBy?.id === userId)) &&
        Boolean(session.sessionGroupId) &&
        !sessionGroup?.archivedAt &&
        sessionGroup?.status !== "merged" &&
        getSidebarSessionChannelId(session) === channelId
      );
    },
    (a, b) => {
      const aSort = a.lastMessageAt ?? a.updatedAt ?? a.createdAt;
      const bSort = b.lastMessageAt ?? b.updatedAt ?? b.createdAt;
      const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    },
  );
}

function areSidebarSessionRecordsEqual(
  previous: SidebarSessionRecord[],
  next: SidebarSessionRecord[],
): boolean {
  if (previous.length !== next.length) return false;
  for (let i = 0; i < previous.length; i++) {
    const a = previous[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.sortTimestamp !== b.sortTimestamp ||
      a.status !== b.status
    ) {
      return false;
    }
  }
  return true;
}

function sortSessionRecords(a: SidebarSessionRecord, b: SidebarSessionRecord): number {
  const diff = new Date(b.sortTimestamp).getTime() - new Date(a.sortTimestamp).getTime();
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
}

function useSidebarSessionStatusGroups(sessionIds: string[]): SidebarSessionStatusGroup[] {
  const records = useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): SidebarSessionRecord[] =>
      sessionIds
        .map((sessionId: string) => {
          const session = state.sessions[sessionId];
          if (!session) return null;

          const sessionGroup = session.sessionGroup as SessionGroupRef | undefined;
          const status = getDisplaySessionStatus(
            session.sessionStatus ?? undefined,
            session.prUrl ?? undefined,
            session.agentStatus ?? undefined,
            sessionGroup?.archivedAt ?? undefined,
          );

          return {
            id: session.id,
            name: session.name ?? "",
            sortTimestamp: session.lastMessageAt ?? session.updatedAt ?? session.createdAt,
            status,
          };
        })
        .filter((record): record is SidebarSessionRecord => record !== null),
    areSidebarSessionRecordsEqual,
  );

  return useMemo(() => {
    const groups = new Map<string, SidebarSessionRecord[]>();

    for (const record of records) {
      const statusRecords = groups.get(record.status) ?? [];
      statusRecords.push(record);
      groups.set(record.status, statusRecords);
    }

    return [...groups.entries()]
      .sort(([statusA, recordsA], [statusB, recordsB]) => {
        const statusDiff =
          (sessionStatusGroupOrder[statusA] ?? 99) - (sessionStatusGroupOrder[statusB] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return (
          Math.max(...recordsB.map((record) => new Date(record.sortTimestamp).getTime()), 0) -
          Math.max(...recordsA.map((record) => new Date(record.sortTimestamp).getTime()), 0)
        );
      })
      .map(([status, statusRecords]) => ({
        status,
        sessionIds: [...statusRecords].sort(sortSessionRecords).map((record) => record.id),
      }));
  }, [records]);
}

export const ChannelOwnedSessions = memo(function ChannelOwnedSessions({
  channelId,
  sessionIds,
  expanded,
  onSessionClick,
}: {
  channelId: string;
  sessionIds: string[];
  expanded: boolean;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string) => void;
}) {
  const groups = useSidebarSessionStatusGroups(sessionIds);
  const [collapsedStatuses, setCollapsedStatuses] = useState<ReadonlySet<string>>(() => new Set());

  const toggleStatus = useCallback((status: string) => {
    setCollapsedStatuses((previous) => {
      const next = new Set(previous);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  if (sessionIds.length === 0) return null;

  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-1 space-y-1">
            {groups.map((group) => (
              <SidebarSessionStatusGroup
                key={group.status}
                channelId={channelId}
                collapsed={collapsedStatuses.has(group.status)}
                group={group}
                onSessionClick={onSessionClick}
                onToggle={toggleStatus}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

function SidebarSessionStatusGroup({
  channelId,
  collapsed,
  group,
  onSessionClick,
  onToggle,
}: {
  channelId: string;
  collapsed: boolean;
  group: SidebarSessionStatusGroup;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string) => void;
  onToggle: (status: string) => void;
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  const label = sessionStatusLabel[group.status] ?? group.status;

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-left text-sm font-medium transition-colors hover:bg-white/10",
          sidebarNestedFullWidthRowClass,
        )}
        onClick={() => onToggle(group.status)}
      >
        <Icon size={14} className="shrink-0 text-foreground" />
        <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
        <span className="shrink-0 text-[11px] text-foreground">
          {group.sessionIds.length}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 space-y-0.5">
              {group.sessionIds.map((sessionId) => (
                <OwnedSessionItem
                  key={sessionId}
                  channelId={channelId}
                  sessionId={sessionId}
                  onSessionClick={onSessionClick}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OwnedSessionItem({
  channelId,
  sessionId,
  onSessionClick,
}: {
  channelId: string;
  sessionId: string;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const name = useEntityField("sessions", sessionId, "name");
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId");
  const sessionGroupName = useEntityField("sessionGroups", sessionGroupId ?? "", "name") as
    | string
    | null
    | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const prUrl = useEntityField("sessions", sessionId, "prUrl");
  const workdir = useEntityField("sessions", sessionId, "workdir") as string | null | undefined;
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");
  const createdAt = useEntityField("sessions", sessionId, "createdAt");
  const activeSessionId = useUIStore((s: UIState) => s.activeSessionId);
  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionDoneBadges[sessionId]);

  const displaySessionStatus = getDisplaySessionStatus(sessionStatus, prUrl, agentStatus);
  const displayAgentStatus = getDisplayAgentStatus(agentStatus, sessionStatus, prUrl);
  const color = sessionStatusColor[displaySessionStatus] ?? "text-muted-foreground";
  const isActive = activeSessionId === sessionId;
  const activityLabel = formatSidebarActivity(lastMessageAt ?? updatedAt ?? createdAt);

  if (!sessionGroupId) return null;

  const sessionName = name ?? "Untitled session";
  const sessionUrl = `${window.location.origin}/c/${channelId}/g/${sessionGroupId}/s/${sessionId}`;
  const openSession = () => onSessionClick(channelId, sessionGroupId, sessionId);
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openSession();
  };

  const row = (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group/session-row flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-xs leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        sidebarNestedFullWidthRowClass,
        isActive
          ? "bg-white/10 text-foreground"
          : "text-foreground hover:bg-white/10",
      )}
      onClick={openSession}
      onKeyDown={handleRowKeyDown}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 shrink-0 items-center justify-center",
            color,
          )}
        >
          <AgentStatusIcon agentStatus={displayAgentStatus} size={6} />
          {hasDoneBadge && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          )}
        </span>
        <span className={cn("min-w-0 flex-1 truncate", hasDoneBadge && "font-semibold")}>
          {sessionName}
        </span>
        <span className="shrink-0 text-[11px] text-foreground group-hover/session-row:hidden group-focus-within/session-row:hidden">
          {activityLabel}
        </span>
      </div>
      <button
        type="button"
        className="hidden h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground group-hover/session-row:flex group-focus-within/session-row:flex"
        title="Archive session"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setArchiveOpen(true);
        }}
      >
        <Archive size={13} />
      </button>
    </div>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="block" render={<div />}>
          <SidebarSessionHoverCard
            sessionGroupId={sessionGroupId}
            sessionId={sessionId}
            trigger={row}
          />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={openSession}>
            <ExternalLink size={14} className="mr-1.5 text-muted-foreground" />
            Open session
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setArchiveOpen(true)}>
            <Archive size={14} className="mr-1.5 text-muted-foreground" />
            Archive session
          </ContextMenuItem>
          <ContextMenuSeparator />
          {workdir && (
            <ContextMenuItem onClick={() => void navigator.clipboard.writeText(workdir)}>
              <Copy size={14} className="mr-1.5 text-muted-foreground" />
              Copy working directory
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(sessionId)}>
            <Copy size={14} className="mr-1.5 text-muted-foreground" />
            Copy session ID
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(sessionUrl)}>
            <Link2 size={14} className="mr-1.5 text-muted-foreground" />
            Copy deeplink
          </ContextMenuItem>
          {prUrl && (
            <ContextMenuItem
              render={
                <a href={prUrl} target="_blank" rel="noopener noreferrer">
                  <GitPullRequest size={14} className="mr-1.5 text-muted-foreground" />
                  View PR
                </a>
              }
            />
          )}
        </ContextMenuContent>
      </ContextMenu>
      <ArchiveSessionGroupDialog
        groupId={sessionGroupId}
        groupName={sessionGroupName ?? sessionName}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
      />
    </>
  );
}

function formatSidebarActivity(timestamp: string | undefined): string {
  if (!timestamp) return "";
  const label = timeAgo(timestamp);
  if (label === "just now") return "now";
  return label.replace(" ago", "");
}
