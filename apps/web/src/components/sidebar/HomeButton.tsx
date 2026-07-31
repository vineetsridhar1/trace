import { Home } from "lucide-react";
import { useUIStore, type UIState } from "../../stores/ui";
import { cn } from "../../lib/utils";

export function HomeButton() {
  const activePage = useUIStore((s: UIState) => s.activePage);
  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  const activeChatId = useUIStore((s: UIState) => s.activeChatId);
  const setActiveChannelId = useUIStore((s: UIState) => s.setActiveChannelId);

  const isActive = activePage === "main" && !activeChannelId && !activeChatId;

  return (
    <button
      type="button"
      onClick={() => setActiveChannelId(null)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        "pl-4",
        isActive
          ? "bg-white/10 text-foreground"
          : "text-foreground hover:bg-white/10",
      )}
    >
      <Home size={16} />
      <span>Home</span>
      <kbd className="ml-auto mr-2 rounded border border-[var(--th-edge)] bg-[var(--th-surface)] px-1.5 py-0.5 font-mono text-[9px] font-normal text-[var(--th-muted)]">
        ⌘N
      </kbd>
    </button>
  );
}
