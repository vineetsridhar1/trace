import { Plug } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";

export function ConnectionsButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActivePage = useUIStore((s) => s.setActivePage);

  return (
    <button
      type="button"
      onClick={() => setActivePage("connections")}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        activePage === "connections"
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
      )}
    >
      <Plug size={16} />
      <span>Connections</span>
    </button>
  );
}
