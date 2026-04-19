import { Files, GitCommitHorizontal, GitCompareArrows } from "lucide-react";
import { cn } from "../../lib/utils";
import { FileExplorer } from "./FileExplorer";
import { CheckpointPanel } from "./CheckpointPanel";
import { BranchChangesPanel } from "./BranchChangesPanel";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";

export type SidebarTab = "files" | "git" | "changes";

interface SidebarPanelProps {
  sessionGroupId: string;
  activeSessionId: string | null;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onFileClick: (filePath: string) => void;
  onDiffFileClick?: (filePath: string, status: string) => void;
  highlightCheckpointId?: string | null;
  onCheckpointClick?: (sessionId: string, promptEventId: string) => void;
  bridgeAccess?: BridgeRuntimeAccessInfo | null;
  onBridgeAccessRequested?: () => void | Promise<void>;
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
  bridgeAccess,
  onBridgeAccessRequested,
}: SidebarPanelProps) {
  const bridgeInteractionAllowed = isBridgeInteractionAllowed(bridgeAccess);

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
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!bridgeInteractionAllowed && activeTab !== "git" ? (
          <div className="p-3">
            <BridgeAccessNotice
              access={bridgeAccess ?? null}
              sessionGroupId={sessionGroupId}
              onRequested={onBridgeAccessRequested}
            />
          </div>
        ) : activeTab === "files" ? (
          <FileExplorer
            sessionGroupId={sessionGroupId}
            onFileClick={onFileClick}
          />
        ) : activeTab === "changes" ? (
          <BranchChangesPanel
            sessionGroupId={sessionGroupId}
            onFileClick={onDiffFileClick ?? (() => {})}
          />
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
