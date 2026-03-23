import { useRef, useState, useEffect } from "react";
import {
  Circle,
  Files,
  GitPullRequest,
  History,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Plus,
  TerminalSquare,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { statusColor, statusLabel } from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface GroupHeaderProps {
  groupName: string | undefined;
  selectedStatus: string;
  selectedSessionId: string | null;
  groupPrUrl: string | null | undefined;
  panelMode?: boolean;
  isFullscreen: boolean;
  terminalAllowed: boolean;
  showFiles: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenTerminal: () => void;
  onToggleFullscreen: () => void;
  onToggleFiles: () => void;
}

export function GroupHeader({
  groupName,
  selectedStatus,
  selectedSessionId,
  groupPrUrl,
  panelMode,
  isFullscreen,
  terminalAllowed,
  showFiles,
  onClose,
  onNewChat,
  onOpenTerminal,
  onToggleFullscreen,
  onToggleFiles,
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            title="New session or terminal"
          >
            <Plus size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!selectedSessionId}
            onClick={onNewChat}
          >
            <MessageSquarePlus size={14} />
            Agent
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!terminalAllowed}
            onClick={onOpenTerminal}
          >
            <TerminalSquare size={14} />
            Terminal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        onClick={onToggleFiles}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          showFiles
            ? "bg-surface-elevated text-foreground"
            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
        )}
        title="Toggle file explorer"
      >
        <Files size={14} />
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
