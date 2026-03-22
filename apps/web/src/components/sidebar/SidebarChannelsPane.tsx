import { useState } from "react";
import type { Channel, ChannelGroup } from "@trace/gql";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { InboxButton } from "./InboxButton";
import { OrgSwitcher } from "./OrgSwitcher";
import { SidebarChannelTree } from "./SidebarChannelTree";
import { type SidebarPaneVariant } from "./sidebarTabs";

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
  topLevelItems: TopLevelItem[];
  variant?: SidebarPaneVariant;
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
  topLevelItems,
  variant = "expanded",
}: SidebarChannelsPaneProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForGroupId, setCreateForGroupId] = useState<string | null>(null);
  const bodyClassName = variant === "overlay" ? "px-2 py-2" : "";
  const labelClassName = variant === "overlay" ? "mb-1 px-2" : "px-2 pt-3";

  return (
    <section className="flex h-full min-w-full shrink-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/70">
        <OrgSwitcher large={variant === "overlay"} />
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>
        <div className="px-2 pt-2">
          <InboxButton />
        </div>

        <div className={`flex items-center justify-between ${labelClassName}`}>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Channels
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
          activeOrgId={activeOrgId}
          allChannelIds={allChannelIds}
          channelGroupsById={channelGroupsById}
          channelIdsByGroup={channelIdsByGroup}
          channelsById={channelsById}
          channelsLoading={channelsLoading}
          groupIds={groupIds}
          onAddChannel={(groupId) => {
            setCreateForGroupId(groupId);
            setCreateDialogOpen(true);
          }}
          onChannelClick={onChannelClick}
          topLevelItems={topLevelItems}
        />
      </div>
    </section>
  );
}
