import { features } from "../../lib/features";

export const DM_TAB_INDEX = 0;
export const MAIN_TAB_INDEX = 1;

export type SidebarTab = "dm" | "main";

export function getTabIndex(tab: SidebarTab) {
  return tab === "dm" ? DM_TAB_INDEX : MAIN_TAB_INDEX;
}

export function getTabFromProgress(progress: number): SidebarTab {
  return progress > (DM_TAB_INDEX + MAIN_TAB_INDEX) / 2 ? "main" : "dm";
}

export function getPreferredSidebarTab(
  activeChatId: string | null,
  activeChannelId: string | null,
  activePage: string,
  currentTab: SidebarTab,
) {
  if (!features.messaging) return "main";
  if (activeChatId) return "dm";
  if (
    activeChannelId ||
    activePage === "inbox" ||
    activePage === "connections" ||
    activePage === "tickets" ||
    activePage === "projects"
  )
    return "main";
  return currentTab;
}
