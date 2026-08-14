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
        "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-white/[0.1] text-foreground shadow-sm shadow-black/20"
          : "text-foreground/80 hover:bg-white/[0.07] hover:text-foreground",
      )}
    >
      <Home size={16} className="text-muted-foreground" />
      <span>Home</span>
      <kbd className="ml-auto rounded-md border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <span>⌘</span>
          <span>N</span>
        </span>
      </kbd>
    </button>
  );
}
