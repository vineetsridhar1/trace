import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useWorkspaceSidebarStore } from "../../stores/workspace-sidebar";
import { FileExplorer } from "../session/FileExplorer";
import { useSessionGroupDirectoryTree } from "../session/useSessionGroupDirectoryTree";

export function SidebarFilesPane({ sessionGroupId }: { sessionGroupId: string }) {
  const closeFiles = useWorkspaceSidebarStore((state) => state.closeFiles);
  const requestFileOpen = useWorkspaceSidebarStore((state) => state.requestFileOpen);
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
        <span className="text-sm font-medium">Files</span>
      </div>
      <div className="min-h-0 flex-1">
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
      </div>
    </div>
  );
}
