import { useState, useEffect, useCallback } from "react";
import type { Channel, Repo, InboxItem } from "@trace/gql";
import { useAuthStore } from "../stores/auth";
import { useEntityStore, useEntityIds } from "../stores/entity";
import type { EntityTableMap } from "../stores/entity";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
import { gql } from "@urql/core";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { UserMenu } from "./sidebar/UserMenu";
import { ChannelItem } from "./sidebar/ChannelItem";
import { CreateChannelDialog } from "./sidebar/CreateChannelDialog";
import { PeekOverlay } from "./sidebar/PeekOverlay";
import { InboxButton } from "./sidebar/InboxButton";
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

const REPOS_QUERY = gql`
  query Repos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
    }
  }
`;

const INBOX_ITEMS_QUERY = gql`
  query InboxItems($organizationId: ID!) {
    inboxItems(organizationId: $organizationId) {
      id
      itemType
      status
      title
      summary
      payload
      userId
      sourceType
      sourceId
      createdAt
      resolvedAt
    }
  }
`;

export function AppSidebar() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const refreshTick = useUIStore((s) => s.refreshTick);
  const [peeking, setPeeking] = useState(false);
  const { state } = useSidebar();

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHANNELS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.channels) {
      const fetched = result.data.channels as Array<Channel & { id: string }>;
      upsertMany("channels", fetched);
    }
  }, [activeOrgId, upsertMany]);

  const fetchRepos = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(REPOS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.repos) {
      upsertMany("repos", result.data.repos as Array<Repo & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  const fetchInboxItems = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(INBOX_ITEMS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.inboxItems) {
      upsertMany("inboxItems", result.data.inboxItems as Array<InboxItem & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    fetchChannels();
    fetchRepos();
    fetchInboxItems();
  }, [fetchChannels, fetchRepos, fetchInboxItems, refreshTick]);

  // Close peek when sidebar gets pinned open
  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  const sortedIds = useEntityIds(
    "channels",
    undefined,
    (a, b) => ((a as EntityTableMap["channels"]).name ?? "").localeCompare((b as EntityTableMap["channels"]).name ?? ""),
  );

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="h-12 p-0 border-b border-border">
          <OrgSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <InboxButton />
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <div className="flex items-center justify-between pr-1">
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Channels
              </SidebarGroupLabel>
              <CreateChannelDialog />
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {sortedIds.map((id) => (
                  <ChannelItem
                    key={id}
                    id={id}
                    isActive={id === activeChannelId}
                    onClick={() => setActiveChannelId(id)}
                  />
                ))}
              </SidebarMenu>
              {sortedIds.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No channels yet</p>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-0 border-t border-border">
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      {state === "collapsed" && !peeking && (
        <div className="fixed inset-y-0 left-0 z-50 w-2" onMouseEnter={() => setPeeking(true)} />
      )}

      <PeekOverlay
        visible={peeking && state === "collapsed"}
        channelIds={sortedIds}
        activeChannelId={activeChannelId}
        onChannelClick={setActiveChannelId}
        onMouseLeave={() => setPeeking(false)}
      />
    </>
  );
}
