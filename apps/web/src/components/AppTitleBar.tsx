import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { SidebarTrigger } from "./ui/sidebar";

export function AppTitleBar() {
  return (
    <div className="app-region-drag fixed left-0 right-0 top-[env(safe-area-inset-top)] z-[60] flex h-10 items-center">
      <div className="app-region-no-drag ml-[92px] flex min-w-0 items-center gap-2.5">
        <SidebarTrigger className="h-7 w-7 cursor-pointer rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground" />
        <div className="w-52 min-w-0">
          <OrgSwitcher compact />
        </div>
      </div>
    </div>
  );
}
