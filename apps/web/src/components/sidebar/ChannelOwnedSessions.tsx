import { memo, useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Circle } from "lucide-react";
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

type SessionGroupRef = {
  channel?: { id: string } | null;
  archivedAt?: string | null;
} | null;

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

export function useOwnedSessionIdsForChannel(channelId: string): string[] {
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  return useEntityIds(
    "sessions",
    (session) =>
      Boolean(userId) &&
      session.createdBy?.id === userId &&
      Boolean(session.sessionGroupId) &&
      getSidebarSessionChannelId(session) === channelId,
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
          <div className="ml-4 mt-1 space-y-1 pl-1">
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
  const color = sessionStatusColor[group.status] ?? "text-muted-foreground";
  const label = sessionStatusLabel[group.status] ?? group.status;

  return (
    <div>
      <button
        type="button"
        className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-left text-sm font-medium transition-colors hover:bg-white/10"
        onClick={() => onToggle(group.status)}
      >
        <Icon size={14} className="shrink-0 text-foreground" />
        <Circle size={5} className={cn("shrink-0 fill-current", color)} />
        <span className={cn("min-w-0 flex-1 truncate", color)}>{label}</span>
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
  const name = useEntityField("sessions", sessionId, "name");
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const prUrl = useEntityField("sessions", sessionId, "prUrl");
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

  return (
    <button
      type="button"
      className={cn(
        "flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-xs leading-none transition-colors",
        isActive
          ? "bg-white/10 text-foreground"
          : "text-foreground hover:bg-white/10",
      )}
      title={name ?? "Untitled session"}
      onClick={() => onSessionClick(channelId, sessionGroupId, sessionId)}
    >
      <span
        className={cn("relative inline-flex h-1.5 w-1.5 shrink-0 items-center justify-center", color)}
      >
        <AgentStatusIcon agentStatus={displayAgentStatus} size={6} />
        {hasDoneBadge && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
        )}
      </span>
      <span className={cn("truncate", hasDoneBadge && "font-semibold")}>
        {name ?? "Untitled session"}
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-foreground">{activityLabel}</span>
    </button>
  );
}

function formatSidebarActivity(timestamp: string | undefined): string {
  if (!timestamp) return "";
  const label = timeAgo(timestamp);
  if (label === "just now") return "now";
  return label.replace(" ago", "");
}
