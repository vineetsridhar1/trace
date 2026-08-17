import { AppHistoryControls } from "./AppHistoryControls";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { SidebarTrigger } from "./ui/sidebar";

export function AppTitleBar() {
  const isDesktopShell = typeof window.trace !== "undefined";

  return (
    <div
      className={`app-region-drag fixed left-0 top-[env(safe-area-inset-top)] z-[100] flex h-12 w-[20rem] items-center ${
        isDesktopShell ? "" : "pointer-events-none"
      }`}
    >
      <div
        className={`app-region-no-drag pointer-events-auto flex min-w-0 items-center gap-2 ${
          isDesktopShell ? "ml-[92px]" : "ml-3"
        }`}
      >
        <SidebarTrigger className="h-7 w-7 cursor-pointer rounded-md text-foreground hover:bg-white/10" />
        <AppHistoryControls />
        <div className="min-w-0 flex-1">
          <OrgSwitcher compact />
        </div>
      </div>
    </div>
  );
}
