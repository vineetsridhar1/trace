import { Circle, GitBranch } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";

export function SessionRow({ id }: { id: string }) {
  const name = useEntityField("sessions", id, "name");
  const status = useEntityField("sessions", id, "status");
  const updatedAt = useEntityField("sessions", id, "updatedAt");
  const lastEventPreview = useEntityField("sessions", id, "_lastEventPreview");
  const parentSession = useEntityField("sessions", id, "parentSession") as { id: string; name: string } | null | undefined;
  const createdBy = useEntityField("sessions", id, "createdBy");
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);

  return (
    <button
      type="button"
      className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated/50 cursor-pointer sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,9rem)_minmax(0,9rem)_minmax(0,9rem)]"
      onClick={() => setActiveSessionId(id)}
    >
      <Circle size={8} className={`shrink-0 fill-current ${statusColor[status ?? "active"]}`} />

      <div className="min-w-0 flex-1">
        <span className="text-sm text-foreground truncate block">{name}</span>
        {parentSession && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <GitBranch size={10} className="shrink-0" />
            <span className="truncate">from {parentSession.name}</span>
          </span>
        )}
        {lastEventPreview && !parentSession && (
          <span className="mt-0.5 truncate block border-l-2 border-muted-foreground/30 pl-2 text-xs text-muted-foreground italic">
            {lastEventPreview}
          </span>
        )}
      </div>

      <span className={`hidden w-full min-w-0 truncate text-left text-xs sm:inline ${statusColor[status ?? "active"]}`}>
        {statusLabel[status ?? "active"]}
      </span>

      <div className="hidden min-w-0 w-full items-center gap-1.5 sm:flex">
        {createdBy?.avatarUrl ? (
          <img
            src={createdBy.avatarUrl}
            alt={createdBy.name}
            className="h-4 w-4 rounded-full"
          />
        ) : null}
        <span className="min-w-0 truncate text-left text-xs text-muted-foreground">{createdBy?.name}</span>
      </div>

      <span className="w-full min-w-0 truncate text-left text-xs text-muted-foreground">
        {updatedAt ? timeAgo(updatedAt) : ""}
      </span>
    </button>
  );
}
