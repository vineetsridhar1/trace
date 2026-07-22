import { useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSidebarData } from "../../hooks/useSidebarData";
import { selectChannel } from "../../lib/channel-click-navigation";
import { navigateToSessionGroup, useUIStore } from "../../stores/ui";
import { SidebarChannelsPane } from "./SidebarChannelsPane";
import { UserMenu } from "./UserMenu";

const SIDEBAR_TRANSITION = {
  duration: 0.2,
  ease: [0.42, 0, 0.58, 1],
} as const;

export function PeekOverlay({
  onMouseLeave,
  visible,
}: {
  onMouseLeave: () => void;
  visible: boolean;
}) {
  const sidebarData = useSidebarData();
  const activeChannelId = useUIStore((state) => state.activeChannelId);
  const activeSessionGroupId = useUIStore((state) => state.activeSessionGroupId);
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);
  const isDraggingRef = useRef(false);

  const handleChannelClick = useCallback(
    (id: string) => {
      selectChannel(id);
      onMouseLeave();
    },
    [onMouseLeave],
  );
  const handleChatClick = useCallback(
    (id: string) => {
      setActiveChatId(id);
      onMouseLeave();
    },
    [onMouseLeave, setActiveChatId],
  );
  const handleSessionClick = useCallback(
    (channelId: string, sessionGroupId: string, sessionId: string | null) => {
      navigateToSessionGroup(channelId, sessionGroupId, sessionId);
      onMouseLeave();
    },
    [onMouseLeave],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "tween", ...SIDEBAR_TRANSITION }}
          onMouseLeave={() => {
            if (!isDraggingRef.current) onMouseLeave();
          }}
          className="fixed bottom-2 left-0 top-[calc(env(safe-area-inset-top)+3rem)] z-50 flex w-[calc(22rem+0.5rem)] flex-col pl-2"
        >
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-2xl shadow-black/50 ring-1 ring-white/10">
            <div className="flex min-h-0 flex-1">
              <SidebarChannelsPane
                activeChatId={activeChatId}
                activeChannelId={activeChannelId}
                activeSessionGroupId={activeSessionGroupId}
                activeOrgId={sidebarData.activeOrgId}
                allChannelIds={sidebarData.allChannelIds}
                channelGroupsById={sidebarData.channelGroupsById}
                channelIdsByGroup={sidebarData.channelIdsByGroup}
                channelsById={sidebarData.channelsById}
                channelsLoading={sidebarData.channelsLoading}
                chatIds={sidebarData.chatIds}
                chatsLoading={sidebarData.chatsLoading}
                groupIds={sidebarData.groupIds}
                onChannelClick={handleChannelClick}
                onChatClick={handleChatClick}
                onSessionClick={handleSessionClick}
                onDragActiveChange={(active) => {
                  isDraggingRef.current = active;
                }}
                topLevelItems={sidebarData.topLevelItems}
              />
            </div>
            <div className="border-t border-white/10">
              <UserMenu />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
