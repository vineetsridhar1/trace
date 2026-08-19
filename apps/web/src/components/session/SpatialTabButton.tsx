import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback } from "react";
import { cn } from "../../lib/utils";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";

const tabRailSpring = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 } as const;

interface SpatialTabButtonProps {
  tab: SpatialWorkspaceTab;
  groupId: string;
  targetIndex: number;
  active: boolean;
  compact: boolean;
  onActivate: () => void;
  onClose: () => void;
  onDoubleClick: () => void;
}

export function SpatialTabButton({
  tab,
  groupId,
  targetIndex,
  active,
  compact,
  onActivate,
  onClose,
  onDoubleClick,
}: SpatialTabButtonProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
    isDragging,
  } = useDraggable({ id: tab.id });
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: `tab-target:${tab.id}`,
    data: { type: "tab-rail", groupId, targetIndex, targetTabId: tab.id },
  });
  const setNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDraggableNodeRef(node);
      setDroppableNodeRef(node);
    },
    [setDraggableNodeRef, setDroppableNodeRef],
  );

  return (
    <motion.div
      layout="position"
      layoutId={`spatial-tab-${tab.id}`}
      transition={tabRailSpring}
      className="shrink-0"
    >
      <div
        ref={setNodeRef}
        className={cn(
          "group mb-0 flex shrink-0 items-center rounded-t-lg border-b-2 transition-[background-color,border-color,color,opacity]",
          compact ? "h-8 max-w-40" : "h-9 max-w-56",
          active
            ? "border-x border-t border-border border-b-background bg-surface text-foreground shadow-sm"
            : "border-transparent text-muted-foreground hover:bg-surface-hover/70 hover:text-foreground",
          isDragging && "opacity-0",
          isOver && !isDragging && "ring-1 ring-inset ring-blue-400/70",
        )}
      >
        <button
          type="button"
          onClick={onActivate}
          onDoubleClick={onDoubleClick}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 overflow-hidden py-2 pl-3",
            isDragging ? "cursor-grabbing" : "cursor-pointer",
          )}
          title={tab.label}
          aria-current={active ? "page" : undefined}
          {...listeners}
          {...attributes}
        >
          <span className="shrink-0 text-muted-foreground">{tab.icon}</span>
          <span className={cn("truncate font-medium", compact ? "text-[10px]" : "text-xs")}>
            {tab.label}
          </span>
          {tab.status ? (
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                tab.status === "live" && "bg-emerald-400",
                tab.status === "changed" && "bg-blue-400",
                tab.status === "attention" && "bg-amber-400",
              )}
            />
          ) : null}
        </button>
        {tab.closable !== false ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-surface-hover group-hover:opacity-70 focus:opacity-100"
            aria-label={`Close ${tab.label}`}
          >
            <X size={11} />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
