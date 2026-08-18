import {
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { dockSpatialTab, moveSpatialTab, type SpatialLayout } from "./spatial-workspace-layout";
import {
  getActivatorClientX,
  getDragPointerX,
  getTabRailMove,
  spatialCollisionDetection,
  type HorizontalDragDirection,
} from "./spatial-workspace-drag";

export function useSpatialWorkspaceDrag(
  layout: SpatialLayout,
  setLayout: Dispatch<SetStateAction<SpatialLayout>>,
) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const dragStartLayoutRef = useRef<SpatialLayout | null>(null);
  const lastDragPointerXRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<HorizontalDragDirection>(null);
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => spatialCollisionDetection(args, dragDirectionRef.current),
    [],
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const restoreStartLayout = useCallback(() => {
    if (dragStartLayoutRef.current) setLayout(dragStartLayoutRef.current);
    dragStartLayoutRef.current = null;
  }, [setLayout]);

  const handleDragStart = useCallback(
    ({ active, activatorEvent }: DragStartEvent) => {
      dragStartLayoutRef.current = layout;
      dragDirectionRef.current = null;
      lastDragPointerXRef.current = getActivatorClientX(activatorEvent);
      setDraggedTabId(String(active.id));
    },
    [layout],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const pointerX = getDragPointerX(event);
      if (pointerX !== null) {
        const previousPointerX = lastDragPointerXRef.current;
        if (previousPointerX !== null && Math.abs(pointerX - previousPointerX) >= 1) {
          dragDirectionRef.current = pointerX > previousPointerX ? "right" : "left";
        }
        lastDragPointerXRef.current = pointerX;
      }
      const move = getTabRailMove(event, dragDirectionRef.current);
      if (!move) return;
      setLayout((current) =>
        moveSpatialTab(current, move.tabId, move.groupId, move.targetIndex, true),
      );
    },
    [setLayout],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggedTabId(null);
      const dragDirection = dragDirectionRef.current;
      dragDirectionRef.current = null;
      lastDragPointerXRef.current = null;
      const tabId = String(event.active.id);
      const over = event.over;
      if (!over) {
        restoreStartLayout();
        return;
      }
      const [kind, targetId, edge] = String(over.id).split(":");
      if (kind === "snap" && isSpatialRowPosition(targetId) && isSpatialEdge(edge)) {
        setLayout((current) => dockSpatialTab(current, tabId, edge, targetId));
        dragStartLayoutRef.current = null;
        return;
      }
      const move = getTabRailMove(event, dragDirection);
      if (move) {
        setLayout((current) => moveSpatialTab(current, move.tabId, move.groupId, move.targetIndex));
        dragStartLayoutRef.current = null;
      } else {
        restoreStartLayout();
      }
    },
    [restoreStartLayout, setLayout],
  );

  const handleDragCancel = useCallback(() => {
    setDraggedTabId(null);
    dragDirectionRef.current = null;
    lastDragPointerXRef.current = null;
    restoreStartLayout();
  }, [restoreStartLayout]);

  return {
    collisionDetection,
    draggedTabId,
    handleDragCancel,
    handleDragEnd,
    handleDragMove,
    handleDragStart,
    sensors,
  };
}

function isSpatialEdge(value: string): value is "left" | "right" | "top" | "bottom" {
  return value === "left" || value === "right" || value === "top" || value === "bottom";
}

function isSpatialRowPosition(value: string): value is "full" | "top" | "bottom" {
  return value === "full" || value === "top" || value === "bottom";
}
