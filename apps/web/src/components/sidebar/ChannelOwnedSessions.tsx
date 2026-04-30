import { memo } from "react";
import {
  useAuthStore,
  useEntityField,
  useEntityIds,
  getSessionChannelId,
} from "@trace/client-core";
import type { AuthState, EntityTableMap } from "@trace/client-core";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import {
  getDisplayAgentStatus,
  getDisplaySessionStatus,
  sessionStatusColor,
} from "../session/sessionStatus";
import { useUIStore, type UIState } from "../../stores/ui";
import { cn } from "../../lib/utils";

type SessionGroupRef = {
  channel?: { id: string } | null;
} | null;

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
  if (!expanded || sessionIds.length === 0) return null;

  return (
    <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
      {sessionIds.map((sessionId) => (
        <OwnedSessionItem
          key={sessionId}
          channelId={channelId}
          sessionId={sessionId}
          onSessionClick={onSessionClick}
        />
      ))}
    </div>
  );
});

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
  const activeSessionId = useUIStore((s: UIState) => s.activeSessionId);
  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionDoneBadges[sessionId]);

  const displaySessionStatus = getDisplaySessionStatus(sessionStatus, prUrl, agentStatus);
  const displayAgentStatus = getDisplayAgentStatus(agentStatus, sessionStatus, prUrl);
  const color = sessionStatusColor[displaySessionStatus] ?? "text-muted-foreground";
  const isActive = activeSessionId === sessionId;

  if (!sessionGroupId) return null;

  return (
    <button
      type="button"
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
      title={name ?? "Untitled session"}
      onClick={() => onSessionClick(channelId, sessionGroupId, sessionId)}
    >
      <span
        className={cn("relative inline-flex h-3 w-3 shrink-0 items-center justify-center", color)}
      >
        <AgentStatusIcon agentStatus={displayAgentStatus} size={12} />
        {hasDoneBadge && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
        )}
      </span>
      <span className={cn("truncate", hasDoneBadge && "font-semibold")}>
        {name ?? "Untitled session"}
      </span>
    </button>
  );
}
