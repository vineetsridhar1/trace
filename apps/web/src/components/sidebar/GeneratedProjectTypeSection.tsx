import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type { SessionGroupEntity } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { GeneratedProjectSessionItem } from "./GeneratedProjectSessionItem";
import { projectTypePresentation, type GeneratedProjectKind } from "./generated-project-types";

export function GeneratedProjectTypeSection({
  activeSessionGroupId,
  groups,
  kind,
}: {
  activeSessionGroupId: string | null;
  groups: SessionGroupEntity[];
  kind: GeneratedProjectKind;
}) {
  const [open, setOpen] = useState(true);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const { Icon, label, emptyLabel, className } = projectTypePresentation[kind];
  const sectionId = `generated-projects-${kind}`;

  return (
    <section>
      <div className="group/generated-project-type flex items-center px-2">
        <button
          type="button"
          aria-controls={sectionId}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
          <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground">{groups.length}</span>
        </button>
        <button
          type="button"
          title={emptyLabel}
          aria-label={emptyLabel}
          onClick={() => openGeneratedProjectDialog(kind)}
          className="pointer-events-none flex size-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring group-hover/generated-project-type:pointer-events-auto group-hover/generated-project-type:opacity-100 group-focus-within/generated-project-type:pointer-events-auto group-focus-within/generated-project-type:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>
      {open ? (
        <div id={sectionId} className="space-y-0.5 pl-4">
          {groups.length === 0 ? (
            <button
              type="button"
              onClick={() => openGeneratedProjectDialog(kind)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-3 text-left text-sm text-muted-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus size={16} className={className} />
              <span>{emptyLabel}</span>
            </button>
          ) : (
            groups.map((group) => (
              <GeneratedProjectSessionItem
                key={group.id}
                groupId={group.id}
                isActive={group.id === activeSessionGroupId}
                kind={kind}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
