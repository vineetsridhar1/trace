import { useCallback, useEffect, useState } from "react";
import type { Channel, ChannelGroup } from "@trace/gql";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { features } from "../../lib/features";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { HomeButton } from "./HomeButton";
import { InboxButton } from "./InboxButton";
import { TicketsButton } from "./TicketsButton";
import { SidebarChannelTree } from "./SidebarChannelTree";
import type { SidebarSessionScope } from "./ChannelOwnedSessions";

const SIDEBAR_SESSION_SCOPE_KEY = "trace:sidebar-session-scope";
const SIDEBAR_SESSION_SCOPE_EVENT = "trace:sidebar-session-scope-change";

function readSidebarSessionScope(): SidebarSessionScope {
  return localStorage.getItem(SIDEBAR_SESSION_SCOPE_KEY) === "all" ? "all" : "mine";
}

export interface SidebarChannelsPaneProps {
  activeChannelId: string | null;
  activeSessionGroupId: string | null;
  activeOrgId: string | null;
  allChannelIds: string[];
  channelGroupsById: Record<string, ChannelGroup>;
  channelIdsByGroup: Record<string, string[]>;
  channelsById: Record<string, Channel>;
  channelsLoading: boolean;
  groupIds: string[];
  onChannelClick: (id: string) => void;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string | null) => void;
  onDragActiveChange?: (active: boolean) => void;
  topLevelItems: TopLevelItem[];
}

export function SidebarChannelsPane({
  activeChannelId,
  activeSessionGroupId,
  activeOrgId,
  allChannelIds,
  channelGroupsById,
  channelIdsByGroup,
  channelsById,
  channelsLoading,
  groupIds,
  onChannelClick,
  onSessionClick,
  onDragActiveChange,
  topLevelItems,
}: SidebarChannelsPaneProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForGroupId, setCreateForGroupId] = useState<string | null>(null);
  const [sessionScope, setSessionScope] = useState<SidebarSessionScope>(readSidebarSessionScope);

  useEffect(() => {
    const handleScopeChange = () => setSessionScope(readSidebarSessionScope());
    window.addEventListener(SIDEBAR_SESSION_SCOPE_EVENT, handleScopeChange);
    return () => window.removeEventListener(SIDEBAR_SESSION_SCOPE_EVENT, handleScopeChange);
  }, []);

  const toggleSessionScope = useCallback(() => {
    const current = readSidebarSessionScope();
    const next = current === "mine" ? "all" : "mine";
    localStorage.setItem(SIDEBAR_SESSION_SCOPE_KEY, next);
    setSessionScope(next);
    window.dispatchEvent(new Event(SIDEBAR_SESSION_SCOPE_EVENT));
  }, []);

  return (
    <section className="flex h-full min-w-full max-w-full shrink-0 snap-start snap-always flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5 pb-1">
          <HomeButton />
          <InboxButton />
          {features.tickets && <TicketsButton />}
        </div>

        <div className="flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Projects
          </span>
          <div className="flex items-center gap-0.5">
            <BrowseChannelsDialog />
            <CreateChannelDialog
              open={createDialogOpen}
              onOpenChange={setCreateDialogOpen}
              defaultGroupId={createForGroupId}
              onTriggerClick={() => {
                setCreateForGroupId(null);
                setCreateDialogOpen(true);
              }}
            />
          </div>
        </div>

        <SidebarChannelTree
          activeChannelId={activeChannelId}
          activeSessionGroupId={activeSessionGroupId}
          activeOrgId={activeOrgId}
          allChannelIds={allChannelIds}
          channelGroupsById={channelGroupsById}
          channelIdsByGroup={channelIdsByGroup}
          channelsById={channelsById}
          channelsLoading={channelsLoading}
          groupIds={groupIds}
          onToggleSessionScope={toggleSessionScope}
          onAddChannel={(groupId: string) => {
            setCreateForGroupId(groupId);
            setCreateDialogOpen(true);
          }}
          onChannelClick={onChannelClick}
          onSessionClick={onSessionClick}
          onDragActiveChange={onDragActiveChange}
          sessionScope={sessionScope}
          topLevelItems={topLevelItems}
        />
      </div>
    </section>
  );
}
