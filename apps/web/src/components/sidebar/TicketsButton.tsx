import { SquareCheck } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { sidebarRootLeftEdgeRowClass } from "./sidebarItemStyles";

export function TicketsButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActivePage = useUIStore((s) => s.setActivePage);

  return (
    <button
      type="button"
      onClick={() => setActivePage("tickets")}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        sidebarRootLeftEdgeRowClass,
        "pl-4",
        activePage === "tickets"
          ? "bg-white/10 text-foreground"
          : "text-foreground hover:bg-white/10",
      )}
    >
      <SquareCheck size={16} />
      <span>Tickets</span>
    </button>
  );
}
