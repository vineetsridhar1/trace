import { useCallback, useEffect, useMemo, useState } from "react";
import { useSidebarData } from "../hooks/useSidebarData";
import { useRegisterCommands } from "../hooks/useRegisterCommands";
import type { RegisteredCommand } from "../stores/command-registry";
import { selectChannel } from "../lib/channel-click-navigation";
import { navigateToSessionGroup, useUIStore, type UIState } from "../stores/ui";
import { SidebarChannelsPane } from "./sidebar/SidebarChannelsPane";
import { PeekOverlay } from "./sidebar/PeekOverlay";
import { UserMenu } from "./sidebar/UserMenu";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "./ui/sidebar";

export function AppSidebar() {
  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const activeChatId = useUIStore((s: UIState) => s.activeChatId);
  const setActiveChatId = useUIStore((s: UIState) => s.setActiveChatId);
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const sidebarData = useSidebarData();

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
  const sidebarCommands = useMemo<RegisteredCommand[]>(() => {
    return [
      {
        id: "sidebar.toggle",
        title: "Toggle sidebar",
        group: "Navigation",
        keywords: "sidebar hide show collapse expand",
        run: toggleSidebar,
      },
    ];
  }, [toggleSidebar]);

  useRegisterCommands(sidebarCommands);

  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  return (
    <>
      <Sidebar collapsible="offcanvas" className="border-none">
        <div
          className="flex size-full flex-col bg-transparent text-sidebar-foreground"
          style={{ backgroundColor: "transparent" }}
        >
          <div className="app-region-drag h-12 shrink-0" />
          <SidebarContent className="app-region-no-drag overflow-hidden">
            <div className="flex size-full">
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
                topLevelItems={sidebarData.topLevelItems}
              />
            </div>
          </SidebarContent>

          <SidebarFooter className="app-region-no-drag gap-0 p-0">
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
        onMouseLeave={() => setPeeking(false)}
      />
    </>
  );
}
