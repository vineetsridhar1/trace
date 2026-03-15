import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, History, Square, Circle } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";

export function SessionHeader({
  sessionId,
  onStop,
}: {
  sessionId: string;
  onStop: () => void;
}) {
  const name = useEntityField("sessions", sessionId, "name");
  const status = useEntityField("sessions", sessionId, "status");
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const isActive = status === "active";

  const closeHistory = useCallback(() => setShowHistory(false), []);

  useEffect(() => {
    if (!showHistory) return;
    function handleClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        closeHistory();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeHistory();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showHistory, closeHistory]);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
      <button
        onClick={() => setActiveSessionId(null)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
        title="Back to sessions"
      >
        <ArrowLeft size={16} />
      </button>

      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground truncate">
          {name ?? "Session"}
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative" ref={historyRef}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title="Session history"
          >
            <History size={14} />
            <span className="hidden sm:inline">History</span>
          </button>
          {showHistory && (
            <div className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
              <SessionHistory sessionId={sessionId} />
            </div>
          )}
        </div>

        <span className={`flex items-center gap-1.5 text-xs ${statusColor[status ?? "active"]}`}>
          <Circle size={6} className="fill-current" />
          {statusLabel[status ?? "active"]}
        </span>

        {isActive && (
          <button
            onClick={onStop}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <Square size={12} />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
