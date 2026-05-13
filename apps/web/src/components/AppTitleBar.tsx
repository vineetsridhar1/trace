import { useEntityField } from "@trace/client-core";
import { useUIStore, type UIState } from "../stores/ui";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { SidebarTrigger, useSidebar } from "./ui/sidebar";

export function AppTitleBar() {
  const { state } = useSidebar();
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const sessionGroupName = useEntityField(
    "sessionGroups",
    activeSessionGroupId ?? "",
    "name",
  ) as string | undefined;
  const showSessionName = state === "collapsed" && !!sessionGroupName;

  return (
    <div className="app-region-drag pointer-events-none fixed left-0 right-0 top-[env(safe-area-inset-top)] z-[100] flex h-12 items-center">
      <div className="app-region-no-drag pointer-events-auto ml-[92px] flex min-w-0 items-center gap-2.5">
        <SidebarTrigger className="h-7 w-7 cursor-pointer rounded-md text-foreground hover:bg-white/10" />
        <div className="w-44 min-w-0">
          <OrgSwitcher compact />
        </div>
      </div>
      {showSessionName && (
        <div className="ml-3 min-w-0 max-w-[40vw] truncate text-sm font-semibold text-foreground">
          {sessionGroupName}
        </div>
      )}
    </div>
  );
}
