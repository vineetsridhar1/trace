import { useCallback, useState } from "react";
import { useEntityField } from "@trace/client-core";
import { ChannelItem } from "./ChannelItem";
import {
  ChannelOwnedSessions,
  useSidebarSessionStatusGroupsForChannel,
  type SidebarSessionScope,
} from "./ChannelOwnedSessions";
import { SidebarMenu } from "../ui/sidebar";

function channelExpandedStorageKey(channelId: string): string {
  return `trace:sidebar-channel-expanded:${channelId}`;
}

export function SidebarChannelSection({
  channelId,
  groupId,
  isChannelActive,
  hasActiveSession,
  onChannelClick,
  onSessionClick,
  onToggleSessionScope,
  sessionScope,
}: {
  channelId: string;
  groupId: string | null;
  isChannelActive: boolean;
  hasActiveSession: boolean;
  onChannelClick: (id: string) => void;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string | null) => void;
  onToggleSessionScope: (channelId: string) => void;
  sessionScope: SidebarSessionScope;
}) {
  const channelType = useEntityField("channels", channelId, "type");
  const sessionGroups = useSidebarSessionStatusGroupsForChannel(channelId, sessionScope);
  const showsSessionList = channelType === "coding" || sessionGroups.length > 0;
  const canExpand = showsSessionList;
  const [expanded, setExpanded] = useState(() => {
    return localStorage.getItem(channelExpandedStorageKey(channelId)) !== "false";
  });

  const toggleExpanded = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      localStorage.setItem(channelExpandedStorageKey(channelId), String(next));
      return next;
    });
  }, [channelId]);

  return (
    <div className={groupId === null ? "py-0.5 pl-3" : "py-0.5"}>
      <SidebarMenu>
        <ChannelItem
          id={channelId}
          isActive={isChannelActive && !hasActiveSession}
          onClick={() => onChannelClick(channelId)}
          groupId={groupId}
          canExpand={canExpand}
          canStartSession={channelType === "coding"}
          onToggleSessionScope={() => onToggleSessionScope(channelId)}
          isExpanded={expanded}
          sessionScope={sessionScope}
          onToggleExpanded={toggleExpanded}
        />
      </SidebarMenu>
      {showsSessionList && (
        <ChannelOwnedSessions
          channelId={channelId}
          groups={sessionGroups}
          expanded={expanded}
          onSessionClick={onSessionClick}
        />
      )}
    </div>
  );
}
