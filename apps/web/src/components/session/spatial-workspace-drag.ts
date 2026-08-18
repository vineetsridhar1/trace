import { pointerWithin, type CollisionDetection, type Modifier } from "@dnd-kit/core";
import type { DragEndEvent, DragMoveEvent, DragOverEvent } from "@dnd-kit/core";

export interface TabRailDropData {
  type: "tab-rail";
  groupId: string;
  targetIndex: number;
  targetTabId?: string;
}

export type HorizontalDragDirection = "left" | "right" | null;

const centerDragOverlayOnCursor: Modifier = ({ activatorEvent, overlayNodeRect, over, transform }) => {
  if (!activatorEvent || !overlayNodeRect) return transform;
  if (!("clientX" in activatorEvent) || !("clientY" in activatorEvent)) return transform;
  if (typeof activatorEvent.clientX !== "number" || typeof activatorEvent.clientY !== "number") {
    return transform;
  }
  const pointerCenterY = transform.y + activatorEvent.clientY - overlayNodeRect.top;
  const railCenterY =
    over && isTabRailDropData(over.data.current)
      ? over.rect.top + over.rect.height / 2 - overlayNodeRect.top
      : pointerCenterY;
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - overlayNodeRect.left - overlayNodeRect.width / 2,
    y: railCenterY - overlayNodeRect.height / 2,
  };
};

export const dragOverlayModifiers = [centerDragOverlayOnCursor];

export function spatialCollisionDetection(
  args: Parameters<CollisionDetection>[0],
  direction: HorizontalDragDirection,
) {
  const collisions = pointerWithin(args);
  if (direction && args.pointerCoordinates) {
    const draggedTabWidth = args.active.rect.current.initial?.width ?? 0;
    const leadingEdgeX =
      args.pointerCoordinates.x + (direction === "right" ? draggedTabWidth / 2 : -draggedTabWidth / 2);
    const leadingEdgeCollisions = pointerWithin({
      ...args,
      pointerCoordinates: { x: leadingEdgeX, y: args.pointerCoordinates.y },
    });
    const leadingTabCollision = leadingEdgeCollisions.find(
      (collision) =>
        String(collision.id).startsWith("tab-target:") &&
        String(collision.id) !== `tab-target:${String(args.active.id)}`,
    );
    if (leadingTabCollision) return [leadingTabCollision];
  }
  const tabCollision = collisions.find((collision) => String(collision.id).startsWith("tab-target:"));
  if (tabCollision) return [tabCollision];
  const railCollision = collisions.find((collision) => String(collision.id).startsWith("tab-rail:"));
  if (railCollision) return [railCollision];
  const snapCollision = collisions.find((collision) => String(collision.id).startsWith("snap:"));
  return snapCollision ? [snapCollision] : collisions;
}

export function getTabRailMove(
  event: DragMoveEvent | DragOverEvent | DragEndEvent,
  direction: HorizontalDragDirection,
) {
  const over = event.over;
  if (!over) return null;
  const dropData: unknown = over.data.current;
  if (!isTabRailDropData(dropData)) return null;

  const tabId = String(event.active.id);
  if (dropData.targetTabId === tabId) return null;
  let targetIndex = dropData.targetIndex;
  if (dropData.targetTabId) {
    const pointerX = getDragPointerX(event);
    if (pointerX !== null) {
      const draggedTabWidth = event.active.rect.current.initial?.width ?? 0;
      const targetMidpoint = over.rect.left + over.rect.width / 2;
      const insertAfter =
        direction === "right"
          ? pointerX + draggedTabWidth / 2 > targetMidpoint
          : direction === "left"
            ? pointerX - draggedTabWidth / 2 >= targetMidpoint
            : pointerX > targetMidpoint;
      if (insertAfter) targetIndex += 1;
    }
  }
  return { tabId, groupId: dropData.groupId, targetIndex };
}

export function getDragPointerX(event: DragMoveEvent | DragOverEvent | DragEndEvent) {
  const activatorClientX = getActivatorClientX(event.activatorEvent);
  return activatorClientX === null ? null : activatorClientX + event.delta.x;
}

export function getActivatorClientX(event: Event) {
  if (!("clientX" in event) || typeof event.clientX !== "number") return null;
  return event.clientX;
}

function isTabRailDropData(value: unknown): value is TabRailDropData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    data.type === "tab-rail" &&
    typeof data.groupId === "string" &&
    typeof data.targetIndex === "number" &&
    (data.targetTabId === undefined || typeof data.targetTabId === "string")
  );
}

