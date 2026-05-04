import { useEffect, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";
import { Button } from "../ui/button";
import { NewProjectView } from "./NewProjectView";
import { ProjectDetailView } from "./ProjectDetailView";
import { ProjectListView } from "./ProjectListView";

export function ProjectsView({ projectId }: { projectId: string | null }) {
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (projectId) setIsCreating(false);
  }, [projectId]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <FolderKanban size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Projects</h2>
        <ConnectionStatus />
        <Button size="sm" className="ml-auto" onClick={() => setIsCreating(true)}>
          <Plus size={16} />
          New
        </Button>
      </header>

      {isCreating ? (
        <NewProjectView onCancel={() => setIsCreating(false)} />
      ) : projectId ? (
        <ProjectDetailView projectId={projectId} />
      ) : (
        <ProjectListView onNewProject={() => setIsCreating(true)} />
      )}
    </div>
  );
}
