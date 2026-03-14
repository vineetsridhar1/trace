import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Channel } from "@trace/gql";
import { useAuthStore } from "../stores/auth";
import { useEntityStore } from "../stores/entity";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
import { gql } from "@urql/core";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { UserMenu } from "./sidebar/UserMenu";
import { ChannelItem, PeekChannelItem } from "./sidebar/ChannelItem";
import { CreateChannelDialog } from "./sidebar/CreateChannelDialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "./ui/sidebar";

const CHANNELS_QUERY = gql`
  query Channels($organizationId: ID!) {
    channels(organizationId: $organizationId) {
      id
      name
      type
    }
  }
`;

export function AppSidebar() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const channels = useEntityStore((s) => s.channels);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [peeking, setPeeking] = useState(false);
  const { state } = useSidebar();

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHANNELS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.channels) {
      const fetched = result.data.channels as Array<{
        id: string;
        name: string;
        type: string;
      }>;
      upsertMany("channels", fetched as Array<Channel & { id: string }>);
      setChannelIds(fetched.map((c) => c.id));
    }
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Close peek when sidebar gets pinned open
  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  const sortedIds = useMemo(() =>
    channelIds
      .filter((id) => id in channels)
      .sort((a, b) => {
        const nameA = (channels[a] as { name?: string })?.name ?? "";
        const nameB = (channels[b] as { name?: string })?.name ?? "";
        return nameA.localeCompare(nameB);
      }),
    [channelIds, channels],
  );

  const channelList = (
    ItemComponent: typeof ChannelItem | typeof PeekChannelItem,
  ) =>
    sortedIds.map((id) => (
      <ItemComponent
        key={id}
        id={id}
        isActive={id === activeChannelId}
        onClick={() => setActiveChannelId(id)}
      />
    ));

  const emptyState = (
    <p className="px-2 py-4 text-center text-xs text-muted-foreground">No channels yet</p>
  );

  return (
    <>
      {/* Normal pinned sidebar */}
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="h-12 p-0 border-b border-border">
          <OrgSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <div className="flex items-center justify-between pr-1">
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Channels
              </SidebarGroupLabel>
              <CreateChannelDialog onCreated={fetchChannels} />
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {channelList(ChannelItem)}
              </SidebarMenu>
              {sortedIds.length === 0 && emptyState}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-0 border-t border-border">
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      {/* Invisible edge hover zone — only when collapsed and not already peeking */}
      {state === "collapsed" && !peeking && (
        <div className="fixed inset-y-0 left-0 z-50 w-2" onMouseEnter={() => setPeeking(true)} />
      )}

      {/* Floating peek overlay */}
      <AnimatePresence>
        {peeking && state === "collapsed" && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onMouseLeave={() => setPeeking(false)}
            className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-surface-deep shadow-2xl shadow-black/50 ring-1 ring-border/50"
            style={{ margin: "8px", height: "calc(100% - 16px)", borderRadius: "12px" }}
          >
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl">
              <div className="border-b border-border">
                <OrgSwitcher large />
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2">
                <div className="mb-1 flex items-center justify-between px-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Channels
                  </span>
                  <CreateChannelDialog onCreated={fetchChannels} />
                </div>
                <div className="flex flex-col gap-0.5">
                  {channelList(PeekChannelItem)}
                  {sortedIds.length === 0 && emptyState}
                </div>
              </div>
              <div className="border-t border-border">
                <UserMenu />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
