import { useDroppable } from "@dnd-kit/core";
import { cn } from "../../lib/utils";
import type { SpatialEdge, SpatialRowPosition } from "./spatial-workspace-layout";

const edgeLabels: Record<SpatialEdge, string> = {
  left: "Add column on left",
  right: "Add column on right",
  top: "Split into top row",
  bottom: "Split into bottom row",
};

interface SpatialWorkspaceSnapTargetsProps {
  hasVerticalSplit: boolean;
  canAddFullColumn: boolean;
  canAddTopColumn: boolean;
  canAddBottomColumn: boolean;
}

export function SpatialWorkspaceSnapTargets({
  hasVerticalSplit,
  canAddFullColumn,
  canAddTopColumn,
  canAddBottomColumn,
}: SpatialWorkspaceSnapTargetsProps) {
  if (hasVerticalSplit) {
    return (
      <>
        <SpatialRowSnapTargets position="top" canAddColumn={canAddTopColumn} />
        <SpatialRowSnapTargets position="bottom" canAddColumn={canAddBottomColumn} />
      </>
    );
  }
  return <SpatialRowSnapTargets position="full" canAddColumn={canAddFullColumn} canAddRow />;
}

function SpatialRowSnapTargets({
  position,
  canAddColumn,
  canAddRow = false,
}: {
  position: SpatialRowPosition;
  canAddColumn: boolean;
  canAddRow?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute z-40" style={workspaceSnapTargetBounds(position)}>
      {canAddColumn
        ? (["left", "right"] as const).map((edge) => (
            <SpatialSnapTarget key={edge} rowPosition={position} edge={edge} />
          ))
        : null}
      {canAddRow
        ? (["top", "bottom"] as const).map((edge) => (
            <SpatialSnapTarget key={edge} rowPosition={position} edge={edge} />
          ))
        : null}
    </div>
  );
}

function SpatialSnapTarget({
  rowPosition,
  edge,
}: {
  rowPosition: SpatialRowPosition;
  edge: SpatialEdge;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `snap:${rowPosition}:${edge}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "pointer-events-auto absolute rounded-xl border transition-[background-color,border-color,opacity] duration-150",
        edge === "left" && "inset-y-0 left-0 w-[32%]",
        edge === "right" && "inset-y-0 right-0 w-[32%]",
        edge === "top" && "inset-x-[33%] top-0 h-[32%]",
        edge === "bottom" && "inset-x-[33%] bottom-0 h-[32%]",
        isOver
          ? "border-blue-400 bg-blue-500/25 opacity-100 shadow-[inset_0_0_0_1px_rgb(96_165_250/.15)]"
          : "border-transparent bg-transparent opacity-0",
      )}
      aria-label={edgeLabels[edge]}
    >
      {isOver ? (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-blue-400/30 bg-slate-950/80 px-2.5 py-1.5 text-[10px] font-medium text-blue-200 shadow-xl">
          {edgeLabels[edge]}
        </span>
      ) : null}
    </div>
  );
}

function workspaceSnapTargetBounds(position: SpatialRowPosition) {
  if (position === "top") {
    return { left: "0.5rem", right: "0.5rem", top: "0.5rem", height: "calc(50% - 0.5rem)" };
  }
  if (position === "bottom") {
    return { left: "0.5rem", right: "0.5rem", bottom: "0.5rem", height: "calc(50% - 0.5rem)" };
  }
  return { inset: "0.5rem" };
}
