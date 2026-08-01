import { Boxes } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { sidebarRootLeftEdgeRowClass } from "./sidebarItemStyles";

export function ArtifactsButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActivePage = useUIStore((s) => s.setActivePage);

  return (
    <button
      type="button"
      onClick={() => setActivePage("artifacts")}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        sidebarRootLeftEdgeRowClass,
        "pl-4",
        activePage === "artifacts"
          ? "bg-white/10 text-foreground"
          : "text-foreground hover:bg-white/10",
      )}
    >
      <Boxes size={16} />
      <span>Artifacts</span>
    </button>
  );
}
