import { FolderKanban } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";
import { ProjectDetailView } from "./ProjectDetailView";
import { ProjectListView } from "./ProjectListView";

export function ProjectsView({ projectId }: { projectId: string | null }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <FolderKanban size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Projects</h2>
        <ConnectionStatus />
      </header>

      {projectId ? <ProjectDetailView projectId={projectId} /> : <ProjectListView />}
    </div>
  );
}
