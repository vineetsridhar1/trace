import { FolderKanban } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";

export function ProjectsButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActiveProjectId = useUIStore((s) => s.setActiveProjectId);

  return (
    <button
      type="button"
      onClick={() => setActiveProjectId(null)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        activePage === "projects"
          ? "bg-accent/15 text-accent"
          : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
      )}
    >
      <FolderKanban size={16} />
      <span>Projects</span>
    </button>
  );
}
