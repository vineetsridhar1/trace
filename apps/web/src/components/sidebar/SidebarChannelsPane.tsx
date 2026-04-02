import { useState } from "react";
import type { Channel, ChannelGroup } from "@trace/gql";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog";
import { CreateChannelGroupDialog } from "./CreateChannelGroupDialog";
import { InboxButton } from "./InboxButton";
import { TicketsButton } from "./TicketsButton";
import { OrgSwitcher } from "./OrgSwitcher";
import { SidebarChannelTree } from "./SidebarChannelTree";

export interface SidebarChannelsPaneProps {
  activeChannelId: string | null;
  activeOrgId: string | null;
  allChannelIds: string[];
  channelGroupsById: Record<string, ChannelGroup>;
  channelIdsByGroup: Record<string, string[]>;
  channelsById: Record<string, Channel>;
  channelsLoading: boolean;
  groupIds: string[];
  onChannelClick: (id: string) => void;
  onDragActiveChange?: (active: boolean) => void;
  topLevelItems: TopLevelItem[];
}

export function SidebarChannelsPane({
  activeChannelId,
  activeOrgId,
  allChannelIds,
  channelGroupsById,
  channelIdsByGroup,
  channelsById,
  channelsLoading,
  groupIds,
  onChannelClick,
  onDragActiveChange,
  topLevelItems,
}: SidebarChannelsPaneProps) {
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);

  return (
    <section className="flex h-full min-w-full max-w-full shrink-0 snap-start snap-always flex-col overflow-hidden">
      <div className="mt-2 h-[49px] shrink-0 border-b border-border/70">
        <OrgSwitcher large />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5 pt-0.5 pb-1">
          <InboxButton />
          <TicketsButton />
        </div>

        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Channels
          </span>
          <div className="flex items-center gap-0.5">
            <BrowseChannelsDialog />
            <CreateChannelGroupDialog
              open={createGroupDialogOpen}
              onOpenChange={setCreateGroupDialogOpen}
            />
          </div>
        </div>

        <SidebarChannelTree
          activeChannelId={activeChannelId}
          activeOrgId={activeOrgId}
          allChannelIds={allChannelIds}
          channelGroupsById={channelGroupsById}
          channelIdsByGroup={channelIdsByGroup}
          channelsById={channelsById}
          channelsLoading={channelsLoading}
          groupIds={groupIds}
          onChannelClick={onChannelClick}
          onDragActiveChange={onDragActiveChange}
          topLevelItems={topLevelItems}
        />
      </div>
    </section>
  );
}
