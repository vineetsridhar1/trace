import { useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore, type AuthState, type SessionGroupEntity } from "@trace/client-core";
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
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const currentUserId = useAuthStore((state: AuthState) => state.user?.id ?? null);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const { label, emptyLabel, className } = projectTypePresentation[kind];
  const sectionId = `generated-projects-${kind}`;
  const visibleGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          scope === "all" || group.id === activeSessionGroupId || group.owner?.id === currentUserId,
      ),
    [activeSessionGroupId, currentUserId, groups, scope],
  );

  return (
    <section>
      <div className="group/generated-project-type flex items-center justify-between rounded-md pr-1 transition-colors hover:bg-white/10">
        <button
          type="button"
          aria-controls={sectionId}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-0 py-2 pl-2 text-left text-xs font-semibold uppercase tracking-wider text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            size={14}
            className={cn("shrink-0 transition-transform duration-200", open && "rotate-90")}
          />
          <span className="text-cyan-300/65">{label}</span>
          <span className="ml-1 text-[10px] text-cyan-300/65">{visibleGroups.length}</span>
        </button>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/generated-project-type:opacity-100 group-focus-within/generated-project-type:opacity-100">
          <button
            type="button"
            title={`Show ${scope === "mine" ? "all" : "my"} ${label.toLowerCase()}`}
            aria-label={`${label}: ${scope}`}
            onClick={() => setScope((value) => (value === "mine" ? "all" : "mine"))}
            className="flex h-5 w-9 cursor-pointer items-center justify-center overflow-hidden rounded px-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-foreground/55 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={scope}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {scope}
              </motion.span>
            </AnimatePresence>
          </button>
          <button
            type="button"
            title={emptyLabel}
            aria-label={emptyLabel}
            onClick={() => openGeneratedProjectDialog(kind)}
            className="flex cursor-pointer items-center justify-center rounded p-0.5 text-foreground transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div id={sectionId} className="space-y-0.5 pl-4">
              {visibleGroups.length === 0 ? (
                <button
                  type="button"
                  onClick={() => openGeneratedProjectDialog(kind)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-3 text-left text-sm text-muted-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus size={16} className={className} />
                  <span>{emptyLabel}</span>
                </button>
              ) : (
                visibleGroups.map((group) => (
                  <GeneratedProjectSessionItem
                    key={group.id}
                    groupId={group.id}
                    isActive={group.id === activeSessionGroupId}
                    kind={kind}
                  />
                ))
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
