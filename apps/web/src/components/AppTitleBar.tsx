import { useEntityField } from "@trace/client-core";
import { useUIStore, type UIState } from "../stores/ui";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { SidebarTrigger } from "./ui/sidebar";

export function AppTitleBar() {
  const activePage = useUIStore((s: UIState) => s.activePage);
  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const channelName = useEntityField("channels", activeChannelId ?? "", "name") as
    | string
    | undefined;
  const sessionGroupName = useEntityField("sessionGroups", activeSessionGroupId ?? "", "name") as
    | string
    | undefined;
  const activeTitle = activePage === "main" ? (sessionGroupName ?? channelName) : undefined;

  return (
    <div className="app-region-drag pointer-events-none fixed left-0 right-0 top-[env(safe-area-inset-top)] z-[100] flex h-12 items-center">
      <div className="app-region-no-drag pointer-events-auto ml-[92px] flex min-w-0 items-center gap-2.5">
        <SidebarTrigger className="h-7 w-7 cursor-pointer rounded-md text-foreground hover:bg-white/10" />
        <div className="w-44 min-w-0">
          <OrgSwitcher compact />
        </div>
      </div>
      {activeTitle && (
        <div className="ml-3 min-w-0 max-w-[40vw] truncate text-sm font-semibold text-foreground">
          {activeTitle}
        </div>
      )}
    </div>
  );
}
