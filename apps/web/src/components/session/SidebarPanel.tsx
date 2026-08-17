import { AppWindow, Files, GitCompareArrows, PanelRightClose, TerminalSquare } from "lucide-react";
import { cn } from "../../lib/utils";
import { BranchChangesPanel } from "./BranchChangesPanel";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { FileExplorer } from "./FileExplorer";
import type { FileTreeNode } from "./file-explorer-utils";
import { SessionApplicationsPanel } from "./applications/SessionApplicationsPanel";
import { TerminalPanel } from "./TerminalPanel";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";

export type SidebarTab = "applications" | "terminal" | "files" | "changes";

interface SidebarPanelProps {
  sessionGroupId: string;
  activeTab: SidebarTab;
  activeSessionId: string | null;
  activeFilePath?: string | null;
  fileTree: FileTreeNode[];
  filesLoading: boolean;
  filesError: string | null;
  canShowApplications: boolean;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  onFileClick: (filePath: string) => void;
  onRefreshFiles: () => Promise<void>;
  onLoadDirectory: (directoryPath: string) => Promise<void>;
  onDiffFileClick?: (filePath: string, status: string) => void;
  onOpenTraffic: (endpointId: string) => void;
  bridgeAccess?: BridgeRuntimeAccessInfo | null;
  onBridgeAccessRequested?: () => void | Promise<void>;
}

const panelMeta: Record<SidebarTab, { title: string; description: string }> = {
  applications: { title: "Applications", description: "Cloud runtimes" },
  terminal: { title: "Terminal", description: "Session process" },
  files: { title: "Files", description: "Workspace files" },
  changes: { title: "Changes", description: "Branch changes" },
};

export function SidebarPanel({
  sessionGroupId,
  activeTab,
  activeSessionId,
  activeFilePath,
  fileTree,
  filesLoading,
  filesError,
  canShowApplications,
  onTabChange,
  onClose,
  onFileClick,
  onRefreshFiles,
  onLoadDirectory,
  onDiffFileClick,
  onOpenTraffic,
  bridgeAccess,
  onBridgeAccessRequested,
}: SidebarPanelProps) {
  const bridgeInteractionAllowed = isBridgeInteractionAllowed(bridgeAccess ?? null);
  const meta = panelMeta[activeTab];

  return (
    <aside className="flex h-full w-full bg-[#18181b] font-sans">
      <nav
        aria-label="Session sidebar destinations"
        className="flex w-12 shrink-0 flex-col items-center border-r border-white/[0.08] bg-black/15 py-2"
      >
        <button
          type="button"
          onClick={onClose}
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
          aria-label="Close sidebar"
          title="Close sidebar"
        >
          <PanelRightClose size={15} />
        </button>
        {canShowApplications ? (
          <SidebarDestination
            active={activeTab === "applications"}
            icon={AppWindow}
            label="Applications"
            live
            onClick={() => onTabChange("applications")}
          />
        ) : null}
        <SidebarDestination
          active={activeTab === "terminal"}
          icon={TerminalSquare}
          label="Terminal"
          onClick={() => onTabChange("terminal")}
        />
        <SidebarDestination
          active={activeTab === "files"}
          icon={Files}
          label="Files"
          onClick={() => onTabChange("files")}
        />
        <SidebarDestination
          active={activeTab === "changes"}
          icon={GitCompareArrows}
          label="Changes"
          onClick={() => onTabChange("changes")}
        />
      </nav>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center px-4">
          <div>
            <h2 className="text-xs font-semibold text-foreground">{meta.title}</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{meta.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
            aria-label="Close sidebar"
          >
            <PanelRightClose size={14} />
          </button>
        </header>

        {!bridgeInteractionAllowed ? (
          <div className="p-3">
            <BridgeAccessNotice
              access={bridgeAccess ?? null}
              sessionGroupId={sessionGroupId}
              onRequested={onBridgeAccessRequested}
            />
          </div>
        ) : activeTab === "applications" ? (
          <SessionApplicationsPanel
            sessionGroupId={sessionGroupId}
            onOpenTraffic={onOpenTraffic}
            embedded
          />
        ) : activeTab === "terminal" ? (
          activeSessionId ? (
            <TerminalPanel sessionId={activeSessionId} onClose={onClose} fill />
          ) : null
        ) : activeTab === "files" ? (
          <FileExplorer
            tree={fileTree}
            activeFilePath={activeFilePath}
            loading={filesLoading}
            error={filesError}
            onRefresh={onRefreshFiles}
            onLoadDirectory={onLoadDirectory}
            onFileClick={onFileClick}
          />
        ) : (
          <BranchChangesPanel
            sessionGroupId={sessionGroupId}
            onFileClick={onDiffFileClick ?? (() => {})}
          />
        )}
      </section>
    </aside>
  );
}

function SidebarDestination({
  active,
  icon: Icon,
  label,
  live = false,
  onClick,
}: {
  active: boolean;
  icon: typeof Files;
  label: string;
  live?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Open ${label}`}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "relative mb-1 flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
        active
          ? "border-white/[0.12] bg-white/[0.09] text-foreground"
          : "border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
      )}
    >
      <Icon size={14} />
      {live ? (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-emerald-400" />
      ) : null}
    </button>
  );
}
