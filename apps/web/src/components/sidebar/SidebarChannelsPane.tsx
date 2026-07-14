import { useCallback, useEffect, useState } from "react";
import type { Channel, ChannelGroup } from "@trace/gql";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { features } from "../../lib/features";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { AppsSection } from "./AppsSection";
import { DesignsSection } from "./DesignsSection";
import { HomeButton } from "./HomeButton";
import { InboxButton } from "./InboxButton";
import { TicketsButton } from "./TicketsButton";
import { SidebarChannelTree } from "./SidebarChannelTree";
import {
  readSidebarSessionScopes,
  toggleSidebarSessionScope,
  type SidebarSessionScopes,
} from "./sidebarSessionScopes";

const SIDEBAR_SESSION_SCOPE_EVENT = "trace:sidebar-session-scope-change";

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
  const [sessionScopes, setSessionScopes] =
    useState<SidebarSessionScopes>(readSidebarSessionScopes);

  useEffect(() => {
    const handleScopeChange = () => setSessionScopes(readSidebarSessionScopes());
    window.addEventListener(SIDEBAR_SESSION_SCOPE_EVENT, handleScopeChange);
    window.addEventListener("storage", handleScopeChange);
    return () => {
      window.removeEventListener(SIDEBAR_SESSION_SCOPE_EVENT, handleScopeChange);
      window.removeEventListener("storage", handleScopeChange);
    };
  }, []);

  const toggleSessionScope = useCallback((channelId: string) => {
    const nextScopes = toggleSidebarSessionScope(channelId);
    setSessionScopes(nextScopes);
    window.dispatchEvent(new Event(SIDEBAR_SESSION_SCOPE_EVENT));
  }, []);

  return (
    <section className="flex h-full min-w-full max-w-full shrink-0 snap-start snap-always flex-col overflow-hidden">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5 pb-1">
          <HomeButton />
          <InboxButton />
          {features.tickets && <TicketsButton />}
        </div>

        <DesignsSection activeOrgId={activeOrgId} activeSessionGroupId={activeSessionGroupId} />
        <AppsSection activeOrgId={activeOrgId} activeSessionGroupId={activeSessionGroupId} />

        <div className="group/projects-header flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Projects
          </span>
          <div className="pointer-events-none flex items-center gap-0.5 opacity-0 transition-opacity group-hover/projects-header:pointer-events-auto group-hover/projects-header:opacity-100 group-focus-within/projects-header:pointer-events-auto group-focus-within/projects-header:opacity-100">
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
          sessionScopes={sessionScopes}
          topLevelItems={topLevelItems}
        />
      </div>
    </section>
  );
}
