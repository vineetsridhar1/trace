import { useState } from "react";
import type { Channel, ChannelGroup } from "@trace/gql";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { features } from "../../lib/features";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { HomeButton } from "./HomeButton";
import { InboxButton } from "./InboxButton";
import { TicketsButton } from "./TicketsButton";
import { OrgSwitcher } from "./OrgSwitcher";
import { SidebarChannelTree } from "./SidebarChannelTree";

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
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string) => void;
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

  return (
    <section className="flex h-full min-w-full max-w-full shrink-0 snap-start snap-always flex-col overflow-hidden">
      <div className="h-[49px] shrink-0 border-b border-white/10">
        <OrgSwitcher large />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-1 pb-6">
          <HomeButton />
          <InboxButton />
          {features.tickets && <TicketsButton />}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/35">
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
          onAddChannel={(groupId: string) => {
            setCreateForGroupId(groupId);
            setCreateDialogOpen(true);
          }}
          onChannelClick={onChannelClick}
          onSessionClick={onSessionClick}
          onDragActiveChange={onDragActiveChange}
          topLevelItems={topLevelItems}
        />
      </div>
    </section>
  );
}
