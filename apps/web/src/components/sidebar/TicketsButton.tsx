import { SquareCheck } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";

export function TicketsButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActivePage = useUIStore((s) => s.setActivePage);

  return (
    <button
      type="button"
      onClick={() => setActivePage("tickets")}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm font-medium transition-colors",
        activePage === "tickets"
          ? "bg-white/[0.1] text-foreground shadow-sm shadow-black/20"
          : "text-foreground/80 hover:bg-white/[0.07] hover:text-foreground",
      )}
    >
      <SquareCheck size={16} className="text-muted-foreground" />
      <span>Tickets</span>
    </button>
  );
}
