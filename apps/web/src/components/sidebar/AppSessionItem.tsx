import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { SessionGroupEntity } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { SessionStatusIndicator } from "../channel/SessionStatusIndicator";
import { DeleteAppDialog } from "./DeleteAppDialog";
import { useAppSessionGroupRow } from "./useAppSessionGroupRow";

export function AppSessionItem({
  group,
  isActive,
}: {
  group: SessionGroupEntity;
  isActive: boolean;
}) {
  const row = useAppSessionGroupRow(group);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = group.name ?? "Untitled app";

  return (
    <>
      <div
        className={cn(
          "group/app-item relative flex h-7 min-w-0 items-center rounded-md transition-colors",
          isActive ? "bg-white/10 text-foreground" : "text-foreground hover:bg-white/10",
        )}
      >
        <button
          type="button"
          onClick={() => navigateToSessionGroup(null, group.id)}
          title={name}
          className="flex h-full min-w-0 flex-1 cursor-pointer touch-manipulation items-center gap-2 rounded-md px-1.5 pr-7 text-left text-xs leading-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SessionStatusIndicator row={row} size={6} showDonePulse={false} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
        </button>
        <button
          type="button"
          title={`Delete ${name}`}
          aria-label={`Delete ${name}`}
          onClick={() => setDeleteOpen(true)}
          className="pointer-events-none absolute right-1 flex size-5 touch-manipulation items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring group-hover/app-item:pointer-events-auto group-hover/app-item:opacity-100 group-focus-within/app-item:pointer-events-auto group-focus-within/app-item:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <DeleteAppDialog
        appId={group.id}
        appName={name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
