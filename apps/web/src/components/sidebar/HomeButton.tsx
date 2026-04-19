import { Home } from "lucide-react";
import { useUIStore, type UIState } from "../../stores/ui";
import { useOnboardingStatus } from "../../hooks/useOnboardingStatus";
import { cn } from "../../lib/utils";

export function HomeButton() {
  const activePage = useUIStore((s: UIState) => s.activePage);
  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  const activeChatId = useUIStore((s: UIState) => s.activeChatId);
  const setActiveChannelId = useUIStore((s: UIState) => s.setActiveChannelId);
  const { allDone } = useOnboardingStatus();

  const isActive = activePage === "main" && !activeChannelId && !activeChatId;

  return (
    <button
      type="button"
      onClick={() => setActiveChannelId(null)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-accent/15 text-accent"
          : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
      )}
    >
      <Home size={16} />
      <span>Home</span>
      {!allDone && (
        <span className="ml-auto h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
      )}
    </button>
  );
}
