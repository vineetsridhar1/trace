import { useCallback, useState } from "react";
import { useEntityField } from "@trace/client-core";
import { ChannelItem } from "./ChannelItem";
import { ChannelOwnedSessions, useOwnedSessionIdsForChannel } from "./ChannelOwnedSessions";
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
}: {
  channelId: string;
  groupId: string | null;
  isChannelActive: boolean;
  hasActiveSession: boolean;
  onChannelClick: (id: string) => void;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string) => void;
}) {
  const channelType = useEntityField("channels", channelId, "type");
  const sessionIds = useOwnedSessionIdsForChannel(channelId);
  const canExpand = channelType !== "text" && sessionIds.length > 0;
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
    <div className="py-1.5">
      <SidebarMenu>
        <ChannelItem
          id={channelId}
          isActive={isChannelActive && !hasActiveSession}
          onClick={() => onChannelClick(channelId)}
          groupId={groupId}
          canExpand={canExpand}
          isExpanded={expanded}
          onToggleExpanded={toggleExpanded}
        />
      </SidebarMenu>
      {canExpand && (
        <ChannelOwnedSessions
          channelId={channelId}
          sessionIds={sessionIds}
          expanded={expanded}
          onSessionClick={onSessionClick}
        />
      )}
    </div>
  );
}
