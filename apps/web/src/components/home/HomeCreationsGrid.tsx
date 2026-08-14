import { useMemo } from "react";
import { Figma, Plus } from "lucide-react";
import { useEntityStore } from "@trace/client-core";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { useUIStore } from "../../stores/ui";
import { GeneratedProjectSessionItem } from "../sidebar/GeneratedProjectSessionItem";

export function HomeCreationsGrid() {
  const sessionGroups = useEntityStore((state) => state.sessionGroups);
  const activeSessionGroupId = useUIStore((state) => state.activeSessionGroupId);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const designs = useMemo(
    () =>
      Object.values(sessionGroups)
        .filter((group) => group.kind === "design" && !group.archivedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [sessionGroups],
  );

  return (
    <section className="mx-auto mt-10 w-full max-w-[720px]">
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--th-heading)]">Your designs</h2>
          <p className="mt-0.5 text-xs text-[var(--th-muted)]">Browse and continue design work.</p>
        </div>
        <button
          type="button"
          onClick={() => openGeneratedProjectDialog("design")}
          className="flex size-8 items-center justify-center rounded-md text-[var(--th-muted)] transition-colors hover:bg-white/10 hover:text-[var(--th-heading)] focus-visible:ring-2 focus-visible:ring-ring"
          title="New design"
          aria-label="New design"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {designs.length === 0 ? (
        <button
          type="button"
          onClick={() => openGeneratedProjectDialog("design")}
          className="flex h-28 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--th-edge)] text-xs text-[var(--th-muted)] transition-colors hover:bg-white/[0.025] hover:text-[var(--th-heading)]"
        >
          <Figma className="size-4" />
          Create your first design
        </button>
      ) : (
        <div className="space-y-0.5 overflow-hidden rounded-[10px] border border-[var(--th-edge)] bg-[var(--th-surface)] p-1.5">
          {designs.map((group) => (
            <GeneratedProjectSessionItem
              key={group.id}
              groupId={group.id}
              isActive={group.id === activeSessionGroupId}
              kind="design"
            />
          ))}
        </div>
      )}
    </section>
  );
}
