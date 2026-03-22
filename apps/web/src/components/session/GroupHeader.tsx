import { useRef, useState, useEffect } from "react";
import {
  Circle,
  GitPullRequest,
  History,
  Maximize2,
  Minimize2,
  Plus,
  TerminalSquare,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { statusColor, statusLabel } from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";

interface GroupHeaderProps {
  groupName: string | undefined;
  selectedStatus: string;
  selectedSessionId: string | null;
  groupPrUrl: string | null | undefined;
  panelMode?: boolean;
  isFullscreen: boolean;
  terminalAllowed: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenTerminal: () => void;
  onToggleFullscreen: () => void;
}

export function GroupHeader({
  groupName,
  selectedStatus,
  selectedSessionId,
  groupPrUrl,
  panelMode,
  isFullscreen,
  terminalAllowed,
  onClose,
  onNewChat,
  onOpenTerminal,
  onToggleFullscreen,
}: GroupHeaderProps) {
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

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

  const label = statusLabel[selectedStatus] ?? selectedStatus;

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
        <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", statusColor[selectedStatus])}>
          <Circle size={6} className="fill-current" />
          {label}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {groupName ?? "Session Group"}
        </h2>
      </div>

      <button
        onClick={onNewChat}
        disabled={!selectedSessionId}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
        title="Start a new chat in this group"
      >
        <Plus size={14} />
        New Chat
      </button>

      <button
        onClick={onOpenTerminal}
        disabled={!terminalAllowed}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
        title="Open terminal"
      >
        <TerminalSquare size={14} />
      </button>

      <div className="relative" ref={historyRef}>
        <button
          onClick={() => setShowHistory((value) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="Group history"
        >
          <History size={14} />
        </button>
        {showHistory && selectedSessionId && (
          <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
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
