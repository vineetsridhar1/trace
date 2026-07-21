import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { SessionStatusIndicator } from "../channel/SessionStatusIndicator";
import { DeleteGeneratedProjectDialog } from "./DeleteGeneratedProjectDialog";
import type { GeneratedProjectKind } from "./generated-project-types";
import { useGeneratedProjectSessionGroupRow } from "./useGeneratedProjectSessionGroupRow";

export function GeneratedProjectSessionItem({
  groupId,
  isActive,
  kind,
}: {
  groupId: string;
  isActive: boolean;
  kind: GeneratedProjectKind;
}) {
  const row = useGeneratedProjectSessionGroupRow(groupId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const groupName = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
  const name = groupName ?? `Untitled ${kind}`;

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
          onClick={() => navigateToSessionGroup(null, groupId)}
          title={name}
          className="flex h-full min-w-0 flex-1 cursor-pointer touch-manipulation items-center gap-2 rounded-md px-1.5 pr-7 text-left text-xs leading-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SessionStatusIndicator row={row} size={6} showDonePulse={false} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
        </button>
        {kind !== "design_system" ? (
          <button
            type="button"
            title={`Delete ${name}`}
            aria-label={`Delete ${name}`}
            onClick={() => setDeleteOpen(true)}
            className="pointer-events-none absolute right-1 flex size-5 touch-manipulation items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring group-hover/app-item:pointer-events-auto group-hover/app-item:opacity-100 group-focus-within/app-item:pointer-events-auto group-focus-within/app-item:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>
      {kind !== "design_system" ? (
        <DeleteGeneratedProjectDialog
          groupId={groupId}
          groupName={name}
          kind={kind}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      ) : null}
    </>
  );
}
