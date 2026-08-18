import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/utils";

interface SpatialResizeHandleProps {
  splitId: string;
  direction: "horizontal" | "vertical";
  ratio: number;
  onResize: (splitId: string, ratio: number) => void;
  onResizeStart: (splitId: string) => void;
  onResizeEnd: () => void;
}

export function SpatialResizeHandle({
  splitId,
  direction,
  ratio,
  onResize,
  onResizeStart,
  onResizeEnd,
}: SpatialResizeHandleProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const container = event.currentTarget.parentElement;
      if (!container) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = container.getBoundingClientRect();
      const axisSize = direction === "horizontal" ? bounds.width : bounds.height;
      if (axisSize <= 0) return;

      cleanupRef.current?.();
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      onResizeStart(splitId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const position =
          direction === "horizontal" ? moveEvent.clientX - bounds.left : moveEvent.clientY - bounds.top;
        const minimumRatio = Math.min(0.45, 48 / axisSize);
        onResize(splitId, Math.max(minimumRatio, Math.min(1 - minimumRatio, position / axisSize)));
      };
      const stopResizing = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
        window.removeEventListener("blur", stopResizing);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        cleanupRef.current = null;
        onResizeEnd();
      };

      cleanupRef.current = stopResizing;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing);
      window.addEventListener("pointercancel", stopResizing);
      window.addEventListener("blur", stopResizing);
    },
    [direction, onResize, onResizeEnd, onResizeStart, splitId],
  );

  return (
    <div
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(ratio * 100)}
      onPointerDown={handlePointerDown}
      className={cn(
        "app-region-no-drag group absolute z-30 touch-none select-none",
        direction === "horizontal"
          ? "inset-y-0 w-2 -translate-x-1/2 cursor-col-resize"
          : "inset-x-0 h-2 -translate-y-1/2 cursor-row-resize",
      )}
      style={direction === "horizontal" ? { left: `${ratio * 100}%` } : { top: `${ratio * 100}%` }}
    >
      <div
        className={cn(
          "absolute bg-transparent transition-colors group-hover:bg-blue-400/70",
          direction === "horizontal" ? "inset-y-0 left-1/2 w-px" : "inset-x-0 top-1/2 h-px",
        )}
      />
    </div>
  );
}

