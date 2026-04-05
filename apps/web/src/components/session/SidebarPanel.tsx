import { Files, GitCommitHorizontal, GitCompareArrows, Github } from "lucide-react";
import { cn } from "../../lib/utils";
import { FileExplorer } from "./FileExplorer";
import { CheckpointPanel } from "./CheckpointPanel";
import { BranchChangesPanel } from "./BranchChangesPanel";
import { GitHubPanel } from "./GitHubPanel";

export type SidebarTab = "files" | "git" | "changes" | "github";

interface SidebarPanelProps {
  sessionGroupId: string;
  activeSessionId: string | null;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onFileClick: (filePath: string) => void;
  onDiffFileClick?: (filePath: string, status: string) => void;
  highlightCheckpointId?: string | null;
  onCheckpointClick?: (sessionId: string, promptEventId: string) => void;
}

const tabClass =
  "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors";
const tabActive = "text-foreground border-b-2 border-foreground";
const tabInactive =
  "text-muted-foreground hover:text-foreground border-b-2 border-transparent";

export function SidebarPanel({
  sessionGroupId,
  activeSessionId,
  activeTab,
  onTabChange,
  onFileClick,
  onDiffFileClick,
  highlightCheckpointId,
  onCheckpointClick,
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
        <button
          type="button"
          onClick={() => onTabChange("changes")}
          className={cn(tabClass, activeTab === "changes" ? tabActive : tabInactive)}
        >
          <GitCompareArrows size={12} />
          Changes
        </button>
        <button
          type="button"
          onClick={() => onTabChange("github")}
          className={cn(tabClass, activeTab === "github" ? tabActive : tabInactive)}
        >
          <Github size={12} />
          GitHub
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "files" ? (
          <FileExplorer
            sessionGroupId={sessionGroupId}
            onFileClick={onFileClick}
          />
        ) : activeTab === "changes" ? (
          <BranchChangesPanel
            sessionGroupId={sessionGroupId}
            onFileClick={onDiffFileClick ?? (() => {})}
          />
        ) : activeTab === "github" ? (
          <GitHubPanel sessionGroupId={sessionGroupId} />
        ) : (
          <CheckpointPanel
            sessionGroupId={sessionGroupId}
            activeSessionId={activeSessionId}
            highlightCheckpointId={highlightCheckpointId}
            onCheckpointClick={onCheckpointClick}
          />
        )}
      </div>
    </div>
  );
}
