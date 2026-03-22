import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSidebarTabScroll } from "../../hooks/useSidebarTabScroll";
import { SidebarChannelsPane, type SidebarChannelsPaneProps } from "./SidebarChannelsPane";
import { SidebarDirectMessagesPane, type SidebarDirectMessagesPaneProps } from "./SidebarDirectMessagesPane";
import { SidebarTabSwitcher } from "./SidebarTabSwitcher";
import { UserMenu } from "./UserMenu";
import { getTabFromProgress, getTabIndex, type SidebarTab } from "./sidebarTabs";

interface PeekOverlayProps
  extends Omit<SidebarChannelsPaneProps, "variant">,
    Omit<SidebarDirectMessagesPaneProps, "variant"> {
  currentTab: SidebarTab;
  onMouseLeave: () => void;
  onTabCommit: (tab: SidebarTab) => void;
  onTabProgressChange: (progress: number) => void;
  visible: boolean;
}

export function PeekOverlay({
  activeChannelId,
  activeChatId,
  activeOrgId,
  allChannelIds,
  channelGroupsById,
  channelIdsByGroup,
  channelsById,
  channelsLoading,
  chatIds,
  chatsLoading,
  currentTab,
  groupIds,
  onChannelClick,
  onChatClick,
  onMouseLeave,
  onTabCommit,
  onTabProgressChange,
  topLevelItems,
  visible,
}: PeekOverlayProps) {
  const tabs = useSidebarTabScroll({
    currentTab,
    enabled: visible,
    onProgressChange: onTabProgressChange,
    onTabCommit,
  });
  const {
    handleScroll,
    handleTouchEnd,
    handleTouchStart,
    jumpToTab,
    selectTab,
    tabProgress,
    viewportRef,
  } = tabs;

  useEffect(() => {
    if (visible) {
      jumpToTab(currentTab);
    }
  }, [currentTab, jumpToTab, visible]);

  const handleOverlayMouseLeave = useCallback(() => {
    const nextTab = getTabFromProgress(tabProgress);
    onTabCommit(nextTab);
    onTabProgressChange(getTabIndex(nextTab));
    onMouseLeave();
  }, [onMouseLeave, onTabCommit, onTabProgressChange, tabProgress]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onMouseLeave={handleOverlayMouseLeave}
          className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-surface-deep shadow-2xl shadow-black/50 ring-1 ring-border/50"
          style={{
            margin: "8px",
            height: "calc(100% - 16px)",
            borderRadius: "12px",
            backgroundColor: `color-mix(in srgb, var(--sidebar) ${tabProgress * 100}%, var(--sidebar-dm))`,
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl">
            <div
              ref={viewportRef}
              className="no-scrollbar flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain"
              onScroll={handleScroll}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            >
              <SidebarDirectMessagesPane
                activeChatId={activeChatId}
                chatIds={chatIds}
                chatsLoading={chatsLoading}
                onChatClick={onChatClick}
                variant="overlay"
              />
              <SidebarChannelsPane
                activeChannelId={activeChannelId}
                activeOrgId={activeOrgId}
                allChannelIds={allChannelIds}
                channelGroupsById={channelGroupsById}
                channelIdsByGroup={channelIdsByGroup}
                channelsById={channelsById}
                channelsLoading={channelsLoading}
                groupIds={groupIds}
                onChannelClick={onChannelClick}
                topLevelItems={topLevelItems}
                variant="overlay"
              />
            </div>

            <div className="px-3 py-2">
              <SidebarTabSwitcher tabProgress={tabProgress} onTabClick={selectTab} />
            </div>
            <div className="border-t border-border">
              <UserMenu />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
