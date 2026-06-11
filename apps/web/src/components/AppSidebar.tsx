import { useCallback, useEffect, useMemo, useState } from "react";
import { useSidebarData } from "../hooks/useSidebarData";
import { useRegisterCommands } from "../hooks/useRegisterCommands";
import type { RegisteredCommand } from "../stores/command-registry";
import { useSidebarTabScroll } from "../hooks/useSidebarTabScroll";
import { selectChannel } from "../lib/channel-click-navigation";
import { features } from "../lib/features";
import { navigateToSessionGroup, useUIStore, type UIState } from "../stores/ui";
import { SidebarChannelsPane } from "./sidebar/SidebarChannelsPane";
import { SidebarDirectMessagesPane } from "./sidebar/SidebarDirectMessagesPane";
import { PeekOverlay } from "./sidebar/PeekOverlay";
import { SidebarTabSwitcher } from "./sidebar/SidebarTabSwitcher";
import { UserMenu } from "./sidebar/UserMenu";
import { getPreferredSidebarTab, getTabIndex, type SidebarTab } from "./sidebar/sidebarTabs";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "./ui/sidebar";

export function AppSidebar() {
  const activePage = useUIStore((s: UIState) => s.activePage);
  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const activeChatId = useUIStore((s: UIState) => s.activeChatId);
  const setActiveChatId = useUIStore((s: UIState) => s.setActiveChatId);
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const sidebarData = useSidebarData();

  const restoreLastVisited = useUIStore((s: UIState) => s.restoreLastVisited);

  const closeSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const handleChannelClick = useCallback(
    (id: string) => {
      selectChannel(id);
      closeSidebar();
    },
    [closeSidebar],
  );

  const handleChatClick = useCallback(
    (id: string) => {
      setActiveChatId(id);
      closeSidebar();
    },
    [setActiveChatId, closeSidebar],
  );

  const handleSessionClick = useCallback(
    (channelId: string, sessionGroupId: string, sessionId: string | null) => {
      navigateToSessionGroup(channelId, sessionGroupId, sessionId);
      closeSidebar();
    },
    [closeSidebar],
  );

  const [peeking, setPeeking] = useState(false);
  const initialTab: SidebarTab = features.messaging && activeChatId ? "dm" : "main";
  const [currentTab, setCurrentTab] = useState<SidebarTab>(initialTab);
  const [peekTabProgress, setPeekTabProgress] = useState(getTabIndex(initialTab));

  const handleTabCommit = useCallback(
    (tab: SidebarTab) => {
      setCurrentTab(tab);
      if (activePage === "main") {
        restoreLastVisited(tab);
      }
    },
    [restoreLastVisited, activePage],
  );

  const expandedTabs = useSidebarTabScroll({
    currentTab,
    onTabCommit: handleTabCommit,
  });

  const sidebarCommands = useMemo<RegisteredCommand[]>(() => {
    const commands: RegisteredCommand[] = [
      {
        id: "sidebar.toggle",
        title: "Toggle sidebar",
        group: "Navigation",
        keywords: "sidebar hide show collapse expand",
        run: toggleSidebar,
      },
    ];
    if (features.messaging) {
      commands.push(
        {
          id: "sidebar.direct-messages",
          title: "Switch to Direct Messages",
          group: "Navigation",
          keywords: "dm direct messages chats",
          run: () => handleTabCommit("dm"),
        },
        {
          id: "sidebar.channels",
          title: "Switch to Channels",
          group: "Navigation",
          keywords: "channels sessions main",
          run: () => handleTabCommit("main"),
        },
      );
    }
    return commands;
  }, [toggleSidebar, handleTabCommit]);

  useRegisterCommands(sidebarCommands);

  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  useEffect(() => {
    setCurrentTab((previousTab: SidebarTab) =>
      getPreferredSidebarTab(activeChatId, activeChannelId, activePage, previousTab),
    );
  }, [activeChannelId, activeChatId, activePage]);

  const tabProgress = !features.messaging
    ? 1
    : state === "expanded"
      ? expandedTabs.tabProgress
      : peeking
        ? peekTabProgress
        : getTabIndex(currentTab);

  return (
    <>
      <Sidebar collapsible="offcanvas" className="border-none">
        <div
          className="flex size-full flex-col bg-transparent text-sidebar-foreground"
          style={{ backgroundColor: "transparent" }}
        >
          <div className="app-region-drag h-12 shrink-0" />
          <SidebarContent className="app-region-no-drag overflow-hidden">
            {features.messaging ? (
              <div
                ref={expandedTabs.viewportRef}
                className="no-scrollbar flex size-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
                onScroll={expandedTabs.handleScroll}
              >
                <SidebarDirectMessagesPane
                  activeChatId={activeChatId}
                  chatIds={sidebarData.chatIds}
                  chatsLoading={sidebarData.chatsLoading}
                  onChatClick={handleChatClick}
                />
                <SidebarChannelsPane
                  activeChannelId={activeChannelId}
                  activeSessionGroupId={activeSessionGroupId}
                  activeOrgId={sidebarData.activeOrgId}
                  allChannelIds={sidebarData.allChannelIds}
                  channelGroupsById={sidebarData.channelGroupsById}
                  channelIdsByGroup={sidebarData.channelIdsByGroup}
                  channelsById={sidebarData.channelsById}
                  channelsLoading={sidebarData.channelsLoading}
                  groupIds={sidebarData.groupIds}
                  onChannelClick={handleChannelClick}
                  onSessionClick={handleSessionClick}
                  topLevelItems={sidebarData.topLevelItems}
                />
              </div>
            ) : (
              <div className="flex size-full">
                <SidebarChannelsPane
                  activeChannelId={activeChannelId}
                  activeSessionGroupId={activeSessionGroupId}
                  activeOrgId={sidebarData.activeOrgId}
                  allChannelIds={sidebarData.allChannelIds}
                  channelGroupsById={sidebarData.channelGroupsById}
                  channelIdsByGroup={sidebarData.channelIdsByGroup}
                  channelsById={sidebarData.channelsById}
                  channelsLoading={sidebarData.channelsLoading}
                  groupIds={sidebarData.groupIds}
                  onChannelClick={handleChannelClick}
                  onSessionClick={handleSessionClick}
                  topLevelItems={sidebarData.topLevelItems}
                />
              </div>
            )}
          </SidebarContent>

          <SidebarFooter className="app-region-no-drag gap-0 p-0">
            {features.messaging && (
              <div className="px-3 py-2">
                <SidebarTabSwitcher tabProgress={tabProgress} onTabClick={expandedTabs.selectTab} />
              </div>
            )}
            <div className="border-t border-white/10">
              <UserMenu />
            </div>
          </SidebarFooter>
        </div>
      </Sidebar>

      {state === "collapsed" && !peeking && (
        <div className="fixed inset-y-0 left-0 z-50 w-8" onMouseEnter={() => setPeeking(true)} />
      )}

      <PeekOverlay
        visible={peeking && state === "collapsed"}
        currentTab={currentTab}
        onMouseLeave={() => setPeeking(false)}
        onTabCommit={handleTabCommit}
        onTabProgressChange={setPeekTabProgress}
      />
    </>
  );
}
