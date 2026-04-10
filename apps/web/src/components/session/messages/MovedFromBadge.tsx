import { ArrowLeft } from "lucide-react";
import { useEntityField } from "../../../stores/entity";
import { useUIStore } from "../../../stores/ui";

export function MovedFromBadge({ sourceSessionId }: { sourceSessionId: string }) {
  const setActiveSessionId = useUIStore(
    (s: { setActiveSessionId: (id: string | null) => void }) => s.setActiveSessionId,
  );
  const sourceName = useEntityField("sessions", sourceSessionId, "name") as string | undefined;

  return (
    <div className="flex justify-center py-2">
      <button
        onClick={() => setActiveSessionId(sourceSessionId)}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-surface-deep px-3 py-1 rounded-full hover:text-foreground hover:bg-surface-elevated transition-colors"
      >
        <ArrowLeft size={10} />
        Continued from {sourceName ?? "previous session"}
      </button>
    </div>
  );
}
