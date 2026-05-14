import { memo, useCallback, useMemo, useState, type KeyboardEvent } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  GitPullRequest,
  Laptop,
  Link2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "@trace/client-core";
import type { AuthState } from "@trace/client-core";
import { useAttachedCheckoutForGroup } from "../../stores/bridges";
import { SessionStatusIndicator } from "../channel/SessionStatusIndicator";
import { sessionStatusGroupOrder, type SessionGroupRow } from "../channel/sessions-table-types";
import { useSessionGroupRows } from "../channel/useSessionGroupRows";
import { sessionStatusColor, sessionStatusLabel } from "../session/sessionStatus";
import { useUIStore, type UIState } from "../../stores/ui";
import { cn, timeAgo } from "../../lib/utils";
import { createQuickSession } from "../../lib/create-quick-session";
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

export type SidebarSessionScope = "mine" | "all";

type CreatedByRef = {
  id?: string | null;
} | null;

export type SidebarSessionGroupRecord = {
  id: string;
  name: string;
  latestSessionId: string | null;
  prUrl: string | null;
  sortTimestamp: string;
  status: string;
  workdir: string | null;
  row: SessionGroupRow;
};

export type SidebarSessionStatusGroup = {
  status: string;
  records: SidebarSessionGroupRecord[];
};

export function useSidebarSessionStatusGroupsForChannel(
  channelId: string,
  scope: SidebarSessionScope,
): SidebarSessionStatusGroup[] {
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const rows = useSessionGroupRows(channelId);

  return useMemo(() => {
    const groups = new Map<string, SidebarSessionGroupRecord[]>();

    for (const row of rows) {
      if (!isRowVisibleForScope(row, scope, userId)) continue;
      const record = buildSidebarSessionGroupRecord(row);
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
          Math.max(...recordsB.map((record) => getRecordSortTime(record)), 0) -
          Math.max(...recordsA.map((record) => getRecordSortTime(record)), 0)
        );
      })
      .map(([status, statusRecords]) => ({
        status,
        records: [...statusRecords].sort(sortSessionGroupRecords),
      }));
  }, [rows, scope, userId]);
}

export const ChannelOwnedSessions = memo(function ChannelOwnedSessions({
  channelId,
  groups,
  expanded,
  onSessionClick,
}: {
  channelId: string;
  groups: SidebarSessionStatusGroup[];
  expanded: boolean;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string | null) => void;
}) {
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
            {groups.length === 0 ? (
              <button
                type="button"
                className={cn(
                  "flex h-7 w-full cursor-pointer items-center rounded-md px-1.5 text-left text-xs text-foreground/45 transition-colors hover:bg-white/10 hover:text-foreground/70",
                  sidebarNestedFullWidthRowClass,
                )}
                onClick={() => createQuickSession(channelId)}
              >
                <span className="truncate">Create a session</span>
              </button>
            ) : (
              groups.map((group) => (
                <SidebarSessionStatusGroup
                  key={group.status}
                  channelId={channelId}
                  collapsed={collapsedStatuses.has(group.status)}
                  group={group}
                  onSessionClick={onSessionClick}
                  onToggle={toggleStatus}
                />
              ))
            )}
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
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string | null) => void;
  onToggle: (status: string) => void;
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  const color = sessionStatusColor[group.status] ?? "text-muted-foreground";
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
        <span className={cn("min-w-0 flex-1 truncate", color)}>{label}</span>
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
              {group.records.map((record) => (
                <OwnedSessionGroupItem
                  key={record.id}
                  channelId={channelId}
                  record={record}
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

function OwnedSessionGroupItem({
  channelId,
  record,
  onSessionClick,
}: {
  channelId: string;
  record: SidebarSessionGroupRecord;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string | null) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionGroupDoneBadges[record.id]);
  const attached = useAttachedCheckoutForGroup(record.id);

  const isActive = activeSessionGroupId === record.id;
  const activityLabel = formatSidebarActivity(record.sortTimestamp);
  const groupUrl = record.latestSessionId
    ? `${window.location.origin}/c/${channelId}/g/${record.id}/s/${record.latestSessionId}`
    : `${window.location.origin}/c/${channelId}/g/${record.id}`;
  const workdir = record.workdir;
  const openSessionGroup = () => onSessionClick(channelId, record.id, record.latestSessionId);
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openSessionGroup();
  };

  const row = (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group/session-row relative flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-xs leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        sidebarNestedFullWidthRowClass,
        isActive ? "bg-white/10 text-foreground" : "text-foreground hover:bg-white/10",
      )}
      onClick={openSessionGroup}
      onKeyDown={handleRowKeyDown}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SessionStatusIndicator row={record.row} size={6} showDonePulse={false} />
        <span className={cn("min-w-0 flex-1 truncate", hasDoneBadge && "font-semibold")}>
          {record.name}
        </span>
        {attached && (
          <span
            title={`Synced to ${attached.bridgeLabel}`}
            className="inline-flex shrink-0"
            aria-label={`Synced to ${attached.bridgeLabel}`}
          >
            <Laptop className="h-3.5 w-3.5 text-emerald-500" />
          </span>
        )}
        <span className="shrink-0 text-[11px] text-foreground group-hover/session-row:hidden group-focus-within/session-row:hidden">
          {activityLabel}
        </span>
      </div>
      <button
        type="button"
        className="hidden h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground group-hover/session-row:flex group-focus-within/session-row:flex"
        title="Archive workspace"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setArchiveOpen(true);
        }}
      >
        <Archive size={13} />
      </button>
      {hasDoneBadge && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive"
        />
      )}
    </div>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="block" render={<div />}>
          <SidebarSessionHoverCard
            sessionGroupId={record.id}
            sessionId={record.latestSessionId}
            trigger={row}
          />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={openSessionGroup}>
            <ExternalLink size={14} className="mr-1.5 text-muted-foreground" />
            Open workspace
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setArchiveOpen(true)}>
            <Archive size={14} className="mr-1.5 text-muted-foreground" />
            Archive workspace
          </ContextMenuItem>
          <ContextMenuSeparator />
          {workdir && (
            <ContextMenuItem onClick={() => void navigator.clipboard.writeText(workdir)}>
              <Copy size={14} className="mr-1.5 text-muted-foreground" />
              Copy working directory
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(record.id)}>
            <Copy size={14} className="mr-1.5 text-muted-foreground" />
            Copy workspace ID
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void navigator.clipboard.writeText(groupUrl)}>
            <Link2 size={14} className="mr-1.5 text-muted-foreground" />
            Copy deeplink
          </ContextMenuItem>
          {record.prUrl && (
            <ContextMenuItem
              render={
                <a href={record.prUrl} target="_blank" rel="noopener noreferrer">
                  <GitPullRequest size={14} className="mr-1.5 text-muted-foreground" />
                  View PR
                </a>
              }
            />
          )}
        </ContextMenuContent>
      </ContextMenu>
      <ArchiveSessionGroupDialog
        groupId={record.id}
        groupName={record.name}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
      />
    </>
  );
}

function isRowVisibleForScope(
  row: SessionGroupRow,
  scope: SidebarSessionScope,
  userId: string | null,
): boolean {
  if (scope === "all") return true;
  if (!userId) return false;
  const createdBy = row.createdBySession?.createdBy as CreatedByRef | undefined;
  return createdBy?.id === userId;
}

function buildSidebarSessionGroupRecord(row: SessionGroupRow): SidebarSessionGroupRecord {
  return {
    id: row.id,
    name: row.name ?? "Untitled workspace",
    latestSessionId: row.latestSession?.id ?? null,
    prUrl: (row.prUrl as string | null | undefined) ?? row.latestSession?.prUrl ?? null,
    sortTimestamp: getRowSortTimestamp(row),
    status: row.displaySessionStatus,
    workdir: (row.workdir as string | null | undefined) ?? row.latestSession?.workdir ?? null,
    row,
  };
}

function getRowSortTimestamp(row: SessionGroupRow): string {
  return row._groupLastMessageAt ?? row._sortTimestamp ?? row.updatedAt ?? row.createdAt;
}

function getRecordSortTime(record: SidebarSessionGroupRecord): number {
  return new Date(record.sortTimestamp).getTime();
}

function sortSessionGroupRecords(
  a: SidebarSessionGroupRecord,
  b: SidebarSessionGroupRecord,
): number {
  const diff = getRecordSortTime(b) - getRecordSortTime(a);
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

function formatSidebarActivity(timestamp: string | undefined): string {
  if (!timestamp) return "";
  const label = timeAgo(timestamp);
  if (label === "just now") return "now";
  return label.replace(" ago", "");
}
