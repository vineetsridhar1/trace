import { Files, GitCompareArrows, Globe, PanelRightClose, TerminalSquare } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { BranchChangesPanel } from "./BranchChangesPanel";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { FileExplorer } from "./FileExplorer";
import type { FileTreeNode } from "./file-explorer-utils";
import { TerminalPanel } from "./TerminalPanel";
import { BrowserWorkspacePanel } from "./BrowserWorkspacePanel";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";

export type SidebarTab = "browser" | "terminal" | "files" | "changes";

interface SidebarPanelProps {
  sessionGroupId: string;
  activeTab: SidebarTab;
  activeSessionId: string | null;
  activeFilePath?: string | null;
  fileTree: FileTreeNode[];
  filesLoading: boolean;
  filesError: string | null;
  canShowBrowser: boolean;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  onFileClick: (filePath: string) => void;
  onRefreshFiles: () => Promise<void>;
  onLoadDirectory: (directoryPath: string) => Promise<void>;
  onDiffFileClick?: (filePath: string, status: string) => void;
  onBrowserTitleChange?: (browserId: string, title: string) => void;
  bridgeAccess?: BridgeRuntimeAccessInfo | null;
  onBridgeAccessRequested?: () => void | Promise<void>;
}

export type WorkspaceSurface = SidebarTab;

export interface WorkspaceSurfaceContentProps {
  sessionGroupId: string;
  browserId?: string;
  browserInitialUrl?: string;
  surface: WorkspaceSurface;
  activeSessionId: string | null;
  activeFilePath?: string | null;
  fileTree: FileTreeNode[];
  filesLoading: boolean;
  filesError: string | null;
  onClose: () => void;
  onFileClick: (filePath: string) => void;
  onRefreshFiles: () => Promise<void>;
  onLoadDirectory: (directoryPath: string) => Promise<void>;
  onDiffFileClick?: (filePath: string, status: string) => void;
  onBrowserTitleChange?: (browserId: string, title: string) => void;
  bridgeAccess?: BridgeRuntimeAccessInfo | null;
  onBridgeAccessRequested?: () => void | Promise<void>;
}

export function SidebarPanel({
  sessionGroupId,
  activeTab,
  activeSessionId,
  activeFilePath,
  fileTree,
  filesLoading,
  filesError,
  canShowBrowser,
  onTabChange,
  onClose,
  onFileClick,
  onRefreshFiles,
  onLoadDirectory,
  onDiffFileClick,
  onBrowserTitleChange,
  bridgeAccess,
  onBridgeAccessRequested,
}: SidebarPanelProps) {
  return (
    <aside className="flex h-full w-full bg-surface-deep font-sans">
      <nav
        aria-label="Session sidebar destinations"
        className="flex w-12 shrink-0 flex-col items-center border-r border-border bg-background/15 py-2"
      >
        <button
          type="button"
          onClick={onClose}
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close sidebar"
          title="Close sidebar"
        >
          <PanelRightClose size={15} />
        </button>
        {canShowBrowser ? (
          <SidebarDestination
            active={activeTab === "browser"}
            icon={Globe}
            label="Browser"
            onClick={() => onTabChange("browser")}
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

      <WorkspaceSurfaceContent
        sessionGroupId={sessionGroupId}
        surface={activeTab}
        activeSessionId={activeSessionId}
        activeFilePath={activeFilePath}
        fileTree={fileTree}
        filesLoading={filesLoading}
        filesError={filesError}
        onClose={onClose}
        onFileClick={onFileClick}
        onRefreshFiles={onRefreshFiles}
        onLoadDirectory={onLoadDirectory}
        onDiffFileClick={onDiffFileClick}
        onBrowserTitleChange={onBrowserTitleChange}
        bridgeAccess={bridgeAccess}
        onBridgeAccessRequested={onBridgeAccessRequested}
      />
    </aside>
  );
}

export function WorkspaceSurfaceContent({
  sessionGroupId,
  browserId = "default",
  browserInitialUrl,
  surface,
  activeSessionId,
  activeFilePath,
  fileTree,
  filesLoading,
  filesError,
  onClose,
  onFileClick,
  onRefreshFiles,
  onLoadDirectory,
  onDiffFileClick,
  onBrowserTitleChange,
  bridgeAccess,
  onBridgeAccessRequested,
}: WorkspaceSurfaceContentProps) {
  const bridgeInteractionAllowed = isBridgeInteractionAllowed(bridgeAccess ?? null);
  const sessionHosting = useEntityField("sessions", activeSessionId ?? "", "hosting") as
    | string
    | undefined;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-deep">
      {!bridgeInteractionAllowed && surface !== "browser" ? (
        <div className="p-3">
          <BridgeAccessNotice
            access={bridgeAccess ?? null}
            sessionGroupId={sessionGroupId}
            onRequested={onBridgeAccessRequested}
          />
        </div>
      ) : surface === "browser" ? (
        <BrowserWorkspacePanel
          sessionGroupId={sessionGroupId}
          browserId={browserId}
          initialUrl={browserInitialUrl}
          sessionHosting={sessionHosting}
          onTitleChange={onBrowserTitleChange}
        />
      ) : surface === "terminal" ? (
        activeSessionId ? (
          <TerminalPanel sessionId={activeSessionId} onClose={onClose} fill />
        ) : null
      ) : surface === "files" ? (
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
  );
}

function SidebarDestination({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Files;
  label: string;
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
          ? "border-border bg-muted text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <Icon size={14} />
    </button>
  );
}
