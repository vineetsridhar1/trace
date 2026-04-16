import { useEffect, useRef, useState } from "react";
import {
  Circle,
  GitPullRequest,
  PanelRight,
  History,
  Maximize2,
  Minimize2,
  Play,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { sessionStatusColor, sessionStatusLabel } from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";
import { useRunScripts } from "../../hooks/useRunScripts";
import { Button } from "../ui/button";
import {
  restoreLinkedCheckout,
  setLinkedCheckoutAutoSync,
  syncLinkedCheckout,
  useLinkedCheckoutStatus,
} from "../../stores/linked-checkout";

interface GroupHeaderProps {
  groupName: string | undefined;
  sessionGroupId: string;
  repoId?: string | null;
  groupBranch?: string | null;
  selectedSessionStatus: string;
  selectedSessionId: string | null;
  groupPrUrl: string | null | undefined;
  panelMode?: boolean;
  isFullscreen: boolean;
  showSidebar: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
}

export function GroupHeader({
  groupName,
  sessionGroupId,
  repoId,
  groupBranch,
  selectedSessionStatus,
  selectedSessionId,
  groupPrUrl,
  panelMode,
  isFullscreen,
  showSidebar,
  onClose,
  onToggleFullscreen,
  onToggleSidebar,
}: GroupHeaderProps) {
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const { hasRunScripts, canRun, handleRun } = useRunScripts(sessionGroupId, selectedSessionId);
  const { status: linkedCheckoutStatus, pending: linkedCheckoutPending, isDesktopAvailable } =
    useLinkedCheckoutStatus(repoId ?? null);

  useEffect(() => {
    if (!showHistory) return;

    function handleClick(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowHistory(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showHistory]);

  const label = sessionStatusLabel[selectedSessionStatus] ?? selectedSessionStatus;
  const isAttachedToThisGroup = linkedCheckoutStatus?.attachedSessionGroupId === sessionGroupId;
  const isAttachedElsewhere = !!linkedCheckoutStatus?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!linkedCheckoutStatus?.repoPath;
  const canShowLinkedCheckoutControls =
    isDesktopAvailable && !!repoId && !!groupBranch && repoLinked;
  const syncedCommitSha =
    linkedCheckoutStatus?.lastSyncedCommitSha ?? linkedCheckoutStatus?.currentCommitSha ?? null;
  const linkedCheckoutSummaryBranch =
    isAttachedToThisGroup && groupBranch ? groupBranch : linkedCheckoutStatus?.targetBranch;

  const handleSyncToRootCheckout = async () => {
    if (!repoId || !groupBranch || linkedCheckoutPending) return;

    try {
      const result = await syncLinkedCheckout({
        repoId,
        sessionGroupId,
        branch: groupBranch,
        autoSyncEnabled: true,
        source: "manual",
      });

      if (!result.ok) {
        toast.error("Failed to sync root checkout", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success("Root checkout synced", {
        description: `Now following ${groupBranch}.`,
      });
    } catch (error) {
      toast.error("Failed to sync root checkout", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleRestoreCheckout = async () => {
    if (!repoId || linkedCheckoutPending) return;

    try {
      const result = await restoreLinkedCheckout(repoId);
      if (!result.ok) {
        toast.error("Failed to restore root checkout", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success("Root checkout restored");
    } catch (error) {
      toast.error("Failed to restore root checkout", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleToggleAutoSync = async () => {
    if (!repoId || !linkedCheckoutStatus || linkedCheckoutPending) return;

    const nextEnabled = !linkedCheckoutStatus.autoSyncEnabled;

    try {
      const result = await setLinkedCheckoutAutoSync(repoId, nextEnabled);
      if (!result.ok) {
        toast.error("Failed to update auto-sync", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success(nextEnabled ? "Auto-sync enabled" : "Auto-sync paused");
    } catch (error) {
      toast.error("Failed to update auto-sync", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
      <button
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        title="Close panel"
      >
        <X size={16} />
      </button>

      {selectedSessionId && (
        <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", sessionStatusColor[selectedSessionStatus])}>
          <Circle size={6} className="fill-current" />
          {label}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {groupName ?? "Session Group"}
        </h2>
        {isAttachedToThisGroup && linkedCheckoutSummaryBranch && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Root checkout following {linkedCheckoutSummaryBranch}
            {syncedCommitSha ? ` at ${syncedCommitSha.slice(0, 7)}` : ""}
            {linkedCheckoutStatus?.autoSyncEnabled ? "" : " (auto-sync paused)"}
          </p>
        )}
        {isAttachedElsewhere && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Root checkout is attached to another Trace session.
          </p>
        )}
        {isAttachedToThisGroup && linkedCheckoutStatus?.lastSyncError && (
          <p className="mt-0.5 truncate text-xs text-destructive">
            {linkedCheckoutStatus.lastSyncError}
          </p>
        )}
      </div>

      {canShowLinkedCheckoutControls && (
        <>
          <Button
            variant={isAttachedToThisGroup ? "secondary" : "outline"}
            size="sm"
            onClick={handleSyncToRootCheckout}
            disabled={linkedCheckoutPending}
          >
            {linkedCheckoutPending ? "Syncing..." : "Sync To Root Checkout"}
          </Button>

          {isAttachedToThisGroup && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleAutoSync}
                disabled={linkedCheckoutPending}
              >
                {linkedCheckoutStatus?.autoSyncEnabled ? "Pause Auto-Sync" : "Resume Auto-Sync"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestoreCheckout}
                disabled={linkedCheckoutPending}
              >
                Restore My Checkout
              </Button>
            </>
          )}
        </>
      )}

      {hasRunScripts && (
        <button
          onClick={handleRun}
          disabled={!canRun}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
          title="Run scripts"
        >
          <Play size={14} />
        </button>
      )}

      <button
        onClick={onToggleSidebar}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          showSidebar
            ? "bg-surface-elevated text-foreground"
            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
        )}
        title="Toggle sidebar"
      >
        <PanelRight size={14} />
      </button>

      <div className="relative" ref={historyRef}>
        <button
          onClick={() => setShowHistory((value: boolean) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="Group history"
        >
          <History size={14} />
        </button>
        {showHistory && selectedSessionId && (
          <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
            <SessionHistory sessionId={selectedSessionId} />
          </div>
        )}
      </div>

      {groupPrUrl && (
        <a
          href={groupPrUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="View Pull Request"
        >
          <GitPullRequest size={14} />
        </a>
      )}

      {panelMode && (
        <button
          onClick={onToggleFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
    </div>
  );
}
