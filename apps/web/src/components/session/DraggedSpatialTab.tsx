import type { SpatialWorkspaceTab } from "./spatial-workspace-types";

export function DraggedSpatialTab({ tab }: { tab: SpatialWorkspaceTab }) {
  return (
    <div className="flex size-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-foreground shadow-2xl shadow-black/60">
      <span className="text-muted-foreground">{tab.icon}</span>
      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
      {tab.status ? <span className="size-1.5 rounded-full bg-emerald-400" /> : null}
    </div>
  );
}
