import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/utils";
import { useWorkspaceSidebarStore } from "../../stores/workspace-sidebar";
import { BranchChangesPanel } from "../session/BranchChangesPanel";
import { FileExplorer } from "../session/FileExplorer";
import { useSessionGroupDirectoryTree } from "../session/useSessionGroupDirectoryTree";

export function SidebarFilesPane({ sessionGroupId }: { sessionGroupId: string }) {
  const closeFiles = useWorkspaceSidebarStore((state) => state.closeFiles);
  const view = useWorkspaceSidebarStore((state) => state.view);
  const setView = useWorkspaceSidebarStore((state) => state.setView);
  const requestFileOpen = useWorkspaceSidebarStore((state) => state.requestFileOpen);
  const requestDiffOpen = useWorkspaceSidebarStore((state) => state.requestDiffOpen);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const { tree, loading, error, refreshTree, loadDirectory } =
    useSessionGroupDirectoryTree(sessionGroupId);

  return (
    <div className="flex size-full flex-col text-sidebar-foreground">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-2">
        <button
          type="button"
          onClick={closeFiles}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label="Back to sidebar"
          title="Back to sidebar"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="flex min-w-0 flex-1 items-center rounded-md bg-white/5 p-0.5">
          {(["files", "changes"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={cn(
                "h-6 min-w-0 flex-1 rounded px-2 text-[11px] font-medium capitalize text-muted-foreground transition-colors hover:text-foreground",
                view === item && "bg-white/10 text-foreground shadow-sm",
              )}
              aria-pressed={view === item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {view === "files" ? (
          <FileExplorer
            tree={tree}
            activeFilePath={activeFilePath}
            loading={loading}
            error={error}
            onRefresh={refreshTree}
            onLoadDirectory={loadDirectory}
            onFileClick={(filePath) => {
              setActiveFilePath(filePath);
              requestFileOpen(sessionGroupId, filePath);
            }}
          />
        ) : (
          <BranchChangesPanel
            sessionGroupId={sessionGroupId}
            onFileClick={(filePath, status) => requestDiffOpen(sessionGroupId, filePath, status)}
          />
        )}
      </div>
    </div>
  );
}
