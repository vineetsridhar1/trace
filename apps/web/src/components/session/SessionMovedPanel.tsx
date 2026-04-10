import { ArrowRight } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useEntityField } from "../../stores/entity";

export function SessionMovedPanel({ newSessionId }: { newSessionId: string }) {
  const setActiveSessionId = useUIStore(
    (s: { setActiveSessionId: (id: string | null) => void }) => s.setActiveSessionId,
  );
  const newSessionName = useEntityField("sessions", newSessionId, "name") as string | undefined;

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
        <ArrowRight size={16} className="shrink-0 text-blue-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Session moved</p>
          <p className="text-xs text-muted-foreground">
            This session was moved to a new runtime.
          </p>
        </div>
        <button
          onClick={() => setActiveSessionId(newSessionId)}
          className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-surface-elevated transition-colors"
        >
          <ArrowRight size={12} />
          {newSessionName ?? "Go to new session"}
        </button>
      </div>
    </div>
  );
}
