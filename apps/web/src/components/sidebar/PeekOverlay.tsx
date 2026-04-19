import { useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSidebarData } from "../../hooks/useSidebarData";
import { useSidebarTabScroll } from "../../hooks/useSidebarTabScroll";
import { features } from "../../lib/features";
import { useUIStore } from "../../stores/ui";
import { SidebarChannelsPane } from "./SidebarChannelsPane";
import { SidebarDirectMessagesPane } from "./SidebarDirectMessagesPane";
import { SidebarTabSwitcher } from "./SidebarTabSwitcher";
import { UserMenu } from "./UserMenu";
import { getTabFromProgress, getTabIndex, type SidebarTab } from "./sidebarTabs";

interface PeekOverlayProps {
  currentTab: SidebarTab;
  onMouseLeave: () => void;
  onTabCommit: (tab: SidebarTab) => void;
  onTabProgressChange: (progress: number) => void;
  visible: boolean;
}

export function PeekOverlay({
  currentTab,
  onMouseLeave,
  onTabCommit,
  onTabProgressChange,
  visible,
}: PeekOverlayProps) {
  const sidebarData = useSidebarData();
  const activeChannelId = useUIStore((s: { activeChannelId: string | null }) => s.activeChannelId);
  const setActiveChannelId = useUIStore((s: { setActiveChannelId: (id: string | null) => void }) => s.setActiveChannelId);
  const activeChatId = useUIStore((s: { activeChatId: string | null }) => s.activeChatId);
  const setActiveChatId = useUIStore((s: { setActiveChatId: (id: string | null) => void }) => s.setActiveChatId);

  const { handleScroll, jumpToTab, selectTab, tabProgress, viewportRef } = useSidebarTabScroll({
    currentTab,
    onProgressChange: onTabProgressChange,
    onTabCommit,
  });

  const prevVisibleRef = useRef(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (visible && !wasVisible) {
      jumpToTab(currentTab);
    }
  }, [currentTab, jumpToTab, visible]);

  const handleChannelClick = useCallback((id: string) => {
    setActiveChannelId(id);
    onMouseLeave();
  }, [setActiveChannelId, onMouseLeave]);

  const handleChatClick = useCallback((id: string) => {
    setActiveChatId(id);
    onMouseLeave();
  }, [setActiveChatId, onMouseLeave]);

  const handleDragActiveChange = useCallback((active: boolean) => {
    isDraggingRef.current = active;
  }, []);

  const handleOverlayMouseLeave = useCallback(() => {
    if (isDraggingRef.current) return;

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
            backgroundColor: `color-mix(in srgb, var(--sidebar) ${(features.messaging ? tabProgress : 1) * 100}%, var(--sidebar-dm))`,
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl">
            {features.messaging ? (
              <div
                ref={viewportRef}
                className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
                onScroll={handleScroll}
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
                  onDragActiveChange={handleDragActiveChange}
                  topLevelItems={sidebarData.topLevelItems}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1">
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
                  onDragActiveChange={handleDragActiveChange}
                  topLevelItems={sidebarData.topLevelItems}
                />
              </div>
            )}

            {features.messaging && (
              <div className="px-3 py-2">
                <SidebarTabSwitcher tabProgress={tabProgress} onTabClick={selectTab} />
              </div>
            )}
            <div className="border-t border-border">
              <UserMenu />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
