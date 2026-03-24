import { Files, GitCommitHorizontal } from "lucide-react";
import { cn } from "../../lib/utils";
import { FileExplorer } from "./FileExplorer";
import { CheckpointPanel } from "./CheckpointPanel";

export type SidebarTab = "files" | "git";

interface SidebarPanelProps {
  sessionGroupId: string;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onFileClick: (filePath: string) => void;
  highlightCheckpointId?: string | null;
}

const tabClass =
  "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors";
const tabActive = "text-foreground border-b-2 border-foreground";
const tabInactive =
  "text-muted-foreground hover:text-foreground border-b-2 border-transparent";

export function SidebarPanel({
  sessionGroupId,
  activeTab,
  onTabChange,
  onFileClick,
  highlightCheckpointId,
}: SidebarPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => onTabChange("files")}
          className={cn(tabClass, activeTab === "files" ? tabActive : tabInactive)}
        >
          <Files size={12} />
          Files
        </button>
        <button
          type="button"
          onClick={() => onTabChange("git")}
          className={cn(tabClass, activeTab === "git" ? tabActive : tabInactive)}
        >
          <GitCommitHorizontal size={12} />
          Checkpoints
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "files" ? (
          <FileExplorer
            sessionGroupId={sessionGroupId}
            onFileClick={onFileClick}
          />
        ) : (
          <CheckpointPanel
            sessionGroupId={sessionGroupId}
            highlightCheckpointId={highlightCheckpointId}
          />
        )}
      </div>
    </div>
  );
}
