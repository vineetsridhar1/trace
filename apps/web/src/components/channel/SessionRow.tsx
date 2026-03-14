import { Circle } from "lucide-react";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";

export function SessionRow({ id }: { id: string }) {
  const name = useEntityField("sessions", id, "name");
  const status = useEntityField("sessions", id, "status") as string | undefined;
  const updatedAt = useEntityStore((s) => (s.sessions[id] as any)?.updatedAt) as string | undefined;
  const createdBy = useEntityField("sessions", id, "createdBy") as
    | { name?: string; avatarUrl?: string }
    | undefined;
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);

  return (
    <tr
      className="group border-b border-border last:border-b-0 transition-colors hover:bg-surface-elevated/50 cursor-pointer"
      onClick={() => setActiveSessionId(id)}
    >
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <Circle size={8} className={`shrink-0 fill-current ${statusColor[status ?? "active"]}`} />
          <span className="text-sm text-foreground truncate">{name}</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-xs ${statusColor[status ?? "active"]}`}>
          {statusLabel[status ?? "active"]}
        </span>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1.5">
          {createdBy?.avatarUrl ? (
            <img
              src={createdBy.avatarUrl}
              alt={createdBy.name}
              className="h-4 w-4 rounded-full"
            />
          ) : null}
          <span className="text-xs text-muted-foreground">{createdBy?.name}</span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-xs text-muted-foreground">
          {updatedAt ? timeAgo(updatedAt) : ""}
        </span>
      </td>
    </tr>
  );
}
