import { Home, Search } from "lucide-react";
import { AppHistoryControls } from "./AppHistoryControls";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { useUIStore } from "../stores/ui";
import { useCommandPaletteStore } from "../stores/command-palette";

export function AppTitleBar() {
  const isDesktopShell = typeof window.trace !== "undefined";
  const goHome = useUIStore((state) => state.setActiveChannelId);
  const openSearch = useCommandPaletteStore((state) => state.openForSearch);

  return (
    <div
      className={`app-region-drag fixed left-0 top-[env(safe-area-inset-top)] z-[100] flex h-12 w-[21rem] items-center ${
        isDesktopShell ? "" : "pointer-events-none"
      }`}
    >
      <div
        className={`app-region-no-drag pointer-events-auto flex min-w-0 items-center gap-2 ${
          isDesktopShell ? "ml-[84px]" : "ml-3"
        }`}
      >
        <button
          type="button"
          onClick={() => goHome(null)}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-950/70 text-emerald-300 transition-colors hover:bg-emerald-900/70"
          aria-label="Go to workspace home"
          title="Home"
        >
          <Home size={13} />
        </button>
        <AppHistoryControls />
        <div className="w-32 min-w-0">
          <OrgSwitcher compact />
        </div>
        <button
          type="button"
          onClick={() => openSearch("")}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label="Open command palette"
          title="Search and commands (⌘K)"
        >
          <Search size={13} />
        </button>
      </div>
    </div>
  );
}
