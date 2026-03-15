import { ArrowLeft, Square, Circle } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "./sessionStatus";

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

  const isActive = status === "active";

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
      <button
        onClick={() => setActiveSessionId(null)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
      </button>

      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground truncate">
          {name ?? "Session"}
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`flex items-center gap-1.5 text-xs ${statusColor[status ?? "active"]}`}>
          <Circle size={6} className="fill-current" />
          {statusLabel[status ?? "active"]}
        </span>

        {isActive && (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <Square size={12} />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
