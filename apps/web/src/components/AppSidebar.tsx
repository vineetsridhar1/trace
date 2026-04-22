import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSidebarData } from "../hooks/useSidebarData";
import { useSidebarTabScroll } from "../hooks/useSidebarTabScroll";
import { features } from "../lib/features";
import { useUIStore, type UIState } from "../stores/ui";
import { ConnectionsButton } from "./sidebar/ConnectionsButton";
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
  const setActiveChannelId = useUIStore((s: UIState) => s.setActiveChannelId);
  const activeChatId = useUIStore((s: UIState) => s.activeChatId);
  const setActiveChatId = useUIStore((s: UIState) => s.setActiveChatId);
  const { state, isMobile, setOpenMobile } = useSidebar();
  const sidebarData = useSidebarData();

  const restoreLastVisited = useUIStore((s: UIState) => s.restoreLastVisited);

  const closeSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const handleChannelClick = useCallback((id: string) => {
    setActiveChannelId(id);
    closeSidebar();
  }, [setActiveChannelId, closeSidebar]);

  const handleChatClick = useCallback((id: string) => {
    setActiveChatId(id);
    closeSidebar();
  }, [setActiveChatId, closeSidebar]);

  const [peeking, setPeeking] = useState(false);
  const initialTab: SidebarTab = features.messaging && activeChatId ? "dm" : "main";
  const [currentTab, setCurrentTab] = useState<SidebarTab>(initialTab);
  const [peekTabProgress, setPeekTabProgress] = useState(getTabIndex(initialTab));

  const handleTabCommit = useCallback((tab: SidebarTab) => {
    setCurrentTab(tab);
    if (activePage === "main") {
      restoreLastVisited(tab);
    }
  }, [restoreLastVisited, activePage]);

  const expandedTabs = useSidebarTabScroll({
    currentTab,
    onTabCommit: handleTabCommit,
  });

  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  useEffect(() => {
    setCurrentTab((previousTab: SidebarTab) => getPreferredSidebarTab(activeChatId, activeChannelId, activePage, previousTab));
  }, [activeChannelId, activeChatId, activePage]);

  const tabProgress = !features.messaging
    ? 1
    : state === "expanded"
      ? expandedTabs.tabProgress
      : peeking
        ? peekTabProgress
        : getTabIndex(currentTab);

  const rafRef = useRef<number>(0);
  useLayoutEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      document.documentElement.style.setProperty(
        "--trace-shell-bg",
        `color-mix(in srgb, var(--th-surface-deep) ${tabProgress * 100}%, var(--sidebar-dm))`,
      );
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [tabProgress]);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--trace-shell-bg");
    };
  }, []);

  return (
    <>
      <Sidebar collapsible="offcanvas" className="border-none">
        <div
          className="flex size-full flex-col"
          style={{
            backgroundColor: `color-mix(in srgb, var(--sidebar) ${tabProgress * 100}%, var(--sidebar-dm))`,
          }}
        >
          <SidebarContent className="overflow-hidden">
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
                  activeOrgId={sidebarData.activeOrgId}
                  allChannelIds={sidebarData.allChannelIds}
                  channelGroupsById={sidebarData.channelGroupsById}
                  channelIdsByGroup={sidebarData.channelIdsByGroup}
                  channelsById={sidebarData.channelsById}
                  channelsLoading={sidebarData.channelsLoading}
                  groupIds={sidebarData.groupIds}
                  onChannelClick={handleChannelClick}
                  topLevelItems={sidebarData.topLevelItems}
                />
              </div>
            ) : (
              <div className="flex size-full">
                <SidebarChannelsPane
                  activeChannelId={activeChannelId}
                  activeOrgId={sidebarData.activeOrgId}
                  allChannelIds={sidebarData.allChannelIds}
                  channelGroupsById={sidebarData.channelGroupsById}
                  channelIdsByGroup={sidebarData.channelIdsByGroup}
                  channelsById={sidebarData.channelsById}
                  channelsLoading={sidebarData.channelsLoading}
                  groupIds={sidebarData.groupIds}
                  onChannelClick={handleChannelClick}
                  topLevelItems={sidebarData.topLevelItems}
                />
              </div>
            )}
          </SidebarContent>

          <SidebarFooter className="gap-0 p-0">
            {features.messaging && (
              <div className="px-3 py-2">
                <SidebarTabSwitcher tabProgress={tabProgress} onTabClick={expandedTabs.selectTab} />
              </div>
            )}
            <div className="border-t border-border/70">
              <div className="px-2 py-1.5">
                <ConnectionsButton />
              </div>
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
        currentTab={currentTab}
        onMouseLeave={() => setPeeking(false)}
        onTabCommit={handleTabCommit}
        onTabProgressChange={setPeekTabProgress}
      />
    </>
  );
}
