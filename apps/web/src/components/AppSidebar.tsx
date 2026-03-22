import { useEffect, useState } from "react";
import { useSidebarData } from "../hooks/useSidebarData";
import { useSidebarTabScroll } from "../hooks/useSidebarTabScroll";
import { useUIStore } from "../stores/ui";
import { SidebarChannelsPane } from "./sidebar/SidebarChannelsPane";
import { SidebarDirectMessagesPane } from "./sidebar/SidebarDirectMessagesPane";
import { PeekOverlay } from "./sidebar/PeekOverlay";
import { SidebarTabSwitcher } from "./sidebar/SidebarTabSwitcher";
import { UserMenu } from "./sidebar/UserMenu";
import { getPreferredSidebarTab, getTabIndex, type SidebarTab } from "./sidebar/sidebarTabs";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "./ui/sidebar";

export function AppSidebar() {
  const activePage = useUIStore((s) => s.activePage);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const { state } = useSidebar();
  const sidebarData = useSidebarData();

  const [peeking, setPeeking] = useState(false);
  const [currentTab, setCurrentTab] = useState<SidebarTab>(activeChatId ? "dm" : "main");
  const [peekTabProgress, setPeekTabProgress] = useState(getTabIndex(activeChatId ? "dm" : "main"));

  const expandedTabs = useSidebarTabScroll({
    currentTab,
    enabled: state === "expanded",
    onTabCommit: setCurrentTab,
  });

  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  useEffect(() => {
    setCurrentTab((previousTab) => getPreferredSidebarTab(activeChatId, activeChannelId, activePage, previousTab));
  }, [activeChannelId, activeChatId, activePage]);

  const tabProgress = state === "expanded"
    ? expandedTabs.tabProgress
    : peeking
      ? peekTabProgress
      : getTabIndex(currentTab);

  useEffect(() => {
    const backgroundBlend = tabProgress * 100;

    document.documentElement.style.setProperty(
      "--trace-shell-bg",
      `color-mix(in srgb, var(--th-surface-deep) ${backgroundBlend}%, var(--sidebar-dm))`,
    );

    return () => {
      document.documentElement.style.removeProperty("--trace-shell-bg");
    };
  }, [tabProgress]);

  const backgroundBlend = tabProgress * 100;

  return (
    <>
      <Sidebar collapsible="offcanvas" className="border-none">
        <div
          className="flex size-full flex-col"
          style={{
            backgroundColor: `color-mix(in srgb, var(--sidebar) ${backgroundBlend}%, var(--sidebar-dm))`,
          }}
        >
          <SidebarContent className="overflow-hidden">
            <div
              ref={expandedTabs.viewportRef}
              className="no-scrollbar flex size-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
              onScroll={expandedTabs.handleScroll}
              onTouchStart={expandedTabs.handleTouchStart}
              onTouchEnd={expandedTabs.handleTouchEnd}
              onTouchCancel={expandedTabs.handleTouchEnd}
            >
              <SidebarDirectMessagesPane
                activeChatId={activeChatId}
                chatIds={sidebarData.chatIds}
                chatsLoading={sidebarData.chatsLoading}
                onChatClick={setActiveChatId}
              />
              <SidebarChannelsPane
                activeChannelId={activeChannelId}
                activeOrgId={sidebarData.activeOrgId}
                allChannelIds={sidebarData.allChannelIds}
                channelGroupsById={sidebarData.channelGroupsById}
                channelIdsByGroup={sidebarData.channelIdsByGroup}
                channelsById={sidebarData.channelsById}
                channelsLoading={sidebarData.channelsLoading}
                groupIds={sidebarData.groupIds}
                onChannelClick={setActiveChannelId}
                topLevelItems={sidebarData.topLevelItems}
              />
            </div>
          </SidebarContent>

          <SidebarFooter className="gap-0 border-t border-border/70 p-0">
            <div className="px-3 py-2">
              <SidebarTabSwitcher tabProgress={tabProgress} onTabClick={expandedTabs.selectTab} />
            </div>
            <div className="border-t border-border/70">
              <UserMenu />
            </div>
          </SidebarFooter>
        </div>
      </Sidebar>

      {state === "collapsed" && !peeking && (
        <div className="fixed inset-y-0 left-0 z-50 w-2" onMouseEnter={() => setPeeking(true)} />
      )}

      <PeekOverlay
        visible={peeking && state === "collapsed"}
        activeChannelId={activeChannelId}
        activeChatId={activeChatId}
        activeOrgId={sidebarData.activeOrgId}
        allChannelIds={sidebarData.allChannelIds}
        channelGroupsById={sidebarData.channelGroupsById}
        channelIdsByGroup={sidebarData.channelIdsByGroup}
        channelsById={sidebarData.channelsById}
        chatIds={sidebarData.chatIds}
        channelsLoading={sidebarData.channelsLoading}
        chatsLoading={sidebarData.chatsLoading}
        currentTab={currentTab}
        groupIds={sidebarData.groupIds}
        onChannelClick={setActiveChannelId}
        onChatClick={setActiveChatId}
        onMouseLeave={() => setPeeking(false)}
        onTabCommit={setCurrentTab}
        onTabProgressChange={setPeekTabProgress}
        topLevelItems={sidebarData.topLevelItems}
      />
    </>
  );
}
