import { AppWindow, Files, GitCommitHorizontal, GitCompareArrows } from "lucide-react";
import { cn } from "../../lib/utils";
import { FileExplorer } from "./FileExplorer";
import { CheckpointPanel } from "./CheckpointPanel";
import { BranchChangesPanel } from "./BranchChangesPanel";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";
import type { FileTreeNode } from "./file-explorer-utils";
import { SessionApplicationsPanel } from "./applications/SessionApplicationsPanel";

export type SidebarTab = "files" | "git" | "changes" | "apps";

interface SidebarPanelProps {
  sessionGroupId: string;
  activeSessionId: string | null;
  activeTab: SidebarTab;
  fileTree: FileTreeNode[];
  filesLoading: boolean;
  filesError: string | null;
  onTabChange: (tab: SidebarTab) => void;
  onFileClick: (filePath: string) => void;
  onRefreshFiles: () => Promise<void>;
  onLoadDirectory: (directoryPath: string) => Promise<void>;
  onDiffFileClick?: (filePath: string, status: string) => void;
  highlightCheckpointId?: string | null;
  onCheckpointClick?: (sessionId: string, promptEventId: string) => void;
  bridgeAccess?: BridgeRuntimeAccessInfo | null;
  onBridgeAccessRequested?: () => void | Promise<void>;
  showApplicationsTab?: boolean;
}

const tabClass = "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors";
const tabActive = "text-foreground border-b-2 border-foreground";
const tabInactive = "text-muted-foreground hover:text-foreground border-b-2 border-transparent";

export function SidebarPanel({
  sessionGroupId,
  activeSessionId,
  activeTab,
  fileTree,
  filesLoading,
  filesError,
  onTabChange,
  onFileClick,
  onRefreshFiles,
  onLoadDirectory,
  onDiffFileClick,
  highlightCheckpointId,
  onCheckpointClick,
  bridgeAccess,
  onBridgeAccessRequested,
  showApplicationsTab = false,
}: SidebarPanelProps) {
  const bridgeInteractionAllowed = isBridgeInteractionAllowed(bridgeAccess ?? null);
  const selectedTab = activeTab === "apps" && !showApplicationsTab ? "files" : activeTab;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => onTabChange("files")}
          className={cn(tabClass, selectedTab === "files" ? tabActive : tabInactive)}
        >
          <Files size={12} />
          Files
        </button>
        <button
          type="button"
          onClick={() => onTabChange("git")}
          className={cn(tabClass, selectedTab === "git" ? tabActive : tabInactive)}
        >
          <GitCommitHorizontal size={12} />
          Checkpoints
        </button>
        <button
          type="button"
          onClick={() => onTabChange("changes")}
          className={cn(tabClass, selectedTab === "changes" ? tabActive : tabInactive)}
        >
          <GitCompareArrows size={12} />
          Changes
        </button>
        {showApplicationsTab && (
          <button
            type="button"
            onClick={() => onTabChange("apps")}
            className={cn(tabClass, selectedTab === "apps" ? tabActive : tabInactive)}
          >
            <AppWindow size={12} />
            Apps
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!bridgeInteractionAllowed && selectedTab !== "git" ? (
          <div className="p-3">
            <BridgeAccessNotice
              access={bridgeAccess ?? null}
              sessionGroupId={sessionGroupId}
              onRequested={onBridgeAccessRequested}
            />
          </div>
        ) : selectedTab === "files" ? (
          <FileExplorer
            tree={fileTree}
            loading={filesLoading}
            error={filesError}
            onRefresh={onRefreshFiles}
            onLoadDirectory={onLoadDirectory}
            onFileClick={onFileClick}
          />
        ) : selectedTab === "changes" ? (
          <BranchChangesPanel
            sessionGroupId={sessionGroupId}
            onFileClick={onDiffFileClick ?? (() => {})}
          />
        ) : selectedTab === "apps" ? (
          <SessionApplicationsPanel sessionGroupId={sessionGroupId} />
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
