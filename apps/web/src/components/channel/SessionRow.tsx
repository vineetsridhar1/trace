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
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated/50 cursor-pointer"
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

      <span className={`hidden shrink-0 text-xs sm:inline ${statusColor[status ?? "active"]}`}>
        {statusLabel[status ?? "active"]}
      </span>

      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {createdBy?.avatarUrl ? (
          <img
            src={createdBy.avatarUrl}
            alt={createdBy.name}
            className="h-4 w-4 rounded-full"
          />
        ) : null}
        <span className="text-xs text-muted-foreground">{createdBy?.name}</span>
      </div>

      <span className="shrink-0 text-xs text-muted-foreground">
        {updatedAt ? timeAgo(updatedAt) : ""}
      </span>
    </button>
  );
}
