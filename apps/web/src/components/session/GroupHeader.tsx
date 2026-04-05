import { useRef, useState, useEffect, useCallback } from "react";
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
import { cn } from "../../lib/utils";
import { sessionStatusColor, sessionStatusLabel } from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";
import { useEntityField } from "../../stores/entity";
import { useUIStore, type UIState } from "../../stores/ui";
import { useTerminalStore } from "../../stores/terminal";
import type { SetupStatus } from "../../stores/terminal";
import { client } from "../../lib/urql";
import { CREATE_TERMINAL_MUTATION } from "../../lib/mutations";

interface GroupHeaderProps {
  groupName: string | undefined;
  sessionGroupId: string;
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

  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  const setShowTerminalPanel = useUIStore((s: UIState) => s.setShowTerminalPanel);
  const runScripts = useEntityField("channels", activeChannelId ?? "", "runScripts") as Array<{ name: string; command: string }> | null | undefined;
  const setupStatus = useTerminalStore((s) => s.setupStatus[sessionGroupId] as SetupStatus | undefined);
  const hasRunScripts = Array.isArray(runScripts) && runScripts.length > 0;
  const setupBlocking = Boolean(useEntityField("channels", activeChannelId ?? "", "setupScript")) && setupStatus === "running";

  const handleRunScripts = useCallback(async () => {
    if (!selectedSessionId || !runScripts) return;
    const addTerminal = useTerminalStore.getState().addTerminal;
    for (const script of runScripts) {
      const result = await client
        .mutation(CREATE_TERMINAL_MUTATION, { sessionId: selectedSessionId, cols: 80, rows: 24 })
        .toPromise();
      if (result.data?.createTerminal) {
        const { id } = result.data.createTerminal as { id: string };
        addTerminal(id, selectedSessionId, sessionGroupId, "connecting", {
          customName: script.name,
          initialCommand: script.command,
        });
      }
    }
    setShowTerminalPanel(true);
  }, [selectedSessionId, sessionGroupId, runScripts, setShowTerminalPanel]);

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
      </div>

      {hasRunScripts && (
        <button
          onClick={handleRunScripts}
          disabled={setupBlocking || !selectedSessionId}
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
