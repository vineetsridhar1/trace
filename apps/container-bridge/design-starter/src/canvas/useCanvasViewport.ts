import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEventHandler,
  type RefObject,
} from "react";
import {
  type CanvasPoint,
  type CanvasViewport,
  acceleratedGestureScale,
  panCanvasViewport,
  pinchCanvasViewport,
  wheelDeltaPixels,
  zoomCanvasViewportAt,
  zoomFromWheel,
} from "./viewport";

type WebKitGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

type TouchPointer = { x: number; y: number };
type PinchGesture = {
  viewport: CanvasViewport;
  point: CanvasPoint;
  distance: number;
};

const INITIAL_VIEWPORT: CanvasViewport = { zoom: 0.75, x: 100, y: 100 };
const PINCH_PAN_THRESHOLD_PX = 12;
const PINCH_ZOOM_EXPONENT = 1.5;

export function useCanvasViewport(containerRef: RefObject<HTMLDivElement | null>) {
  const [viewport, setViewportState] = useState(INITIAL_VIEWPORT);
  const viewportRef = useRef(viewport);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const gestureRef = useRef<{ viewport: CanvasViewport; point: CanvasPoint } | null>(null);
  const touchPointersRef = useRef(new Map<number, TouchPointer>());
  const pinchRef = useRef<PinchGesture | null>(null);

  const setViewport = useCallback(
    (update: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)) => {
      setViewportState((current) => {
        const next = typeof update === "function" ? update(current) : update;
        viewportRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pointInCanvas = (clientX: number, clientY: number): CanvasPoint => {
      const bounds = container.getBoundingClientRect();
      return { x: clientX - bounds.left, y: clientY - bounds.top };
    };
    const centerPoint = (): CanvasPoint => ({
      x: container.clientWidth / 2,
      y: container.clientHeight / 2,
    });
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const deltaX = wheelDeltaPixels(event.deltaX, event.deltaMode, container.clientWidth);
      const deltaY = wheelDeltaPixels(event.deltaY, event.deltaMode, container.clientHeight);
      if (event.ctrlKey || event.metaKey) {
        setViewport((current) =>
          zoomFromWheel(current, deltaY, pointInCanvas(event.clientX, event.clientY)),
        );
        return;
      }
      setViewport((current) => panCanvasViewport(current, deltaX, deltaY));
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      if (touchPointersRef.current.size > 0) return;
      const gesture = event as WebKitGestureEvent;
      gestureRef.current = {
        viewport: viewportRef.current,
        point:
          typeof gesture.clientX === "number" && typeof gesture.clientY === "number"
            ? pointInCanvas(gesture.clientX, gesture.clientY)
            : centerPoint(),
      };
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      if (touchPointersRef.current.size > 0) return;
      const start = gestureRef.current;
      const scale = (event as WebKitGestureEvent).scale;
      if (!start || typeof scale !== "number" || !Number.isFinite(scale)) return;
      setViewport(
        zoomCanvasViewportAt(
          start.viewport,
          start.viewport.zoom * acceleratedGestureScale(scale),
          start.point,
        ),
      );
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      gestureRef.current = null;
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("gesturestart", onGestureStart, { passive: false });
    container.addEventListener("gesturechange", onGestureChange, { passive: false });
    container.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("gesturestart", onGestureStart);
      container.removeEventListener("gesturechange", onGestureChange);
      container.removeEventListener("gestureend", onGestureEnd);
    };
  }, [containerRef, setViewport]);

  const startPinch = useCallback(() => {
    const [first, second] = [...touchPointersRef.current.values()];
    if (!first || !second) return;
    const point = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    pinchRef.current = {
      viewport: viewportRef.current,
      point,
      distance: Math.hypot(second.x - first.x, second.y - first.y),
    };
    dragRef.current = null;
  }, []);

  const onPointerDown: PointerEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (event.pointerType === "touch") {
        event.currentTarget.setPointerCapture(event.pointerId);
        touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPointersRef.current.size >= 2) {
          startPinch();
        } else {
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            panX: viewportRef.current.x,
            panY: viewportRef.current.y,
          };
        }
        return;
      }
      if (event.button !== 0 || event.target !== event.currentTarget) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        panX: viewportRef.current.x,
        panY: viewportRef.current.y,
      };
    },
    [startPinch],
  );
  const onPointerMove: PointerEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (event.pointerType === "touch") {
        const pointer = touchPointersRef.current.get(event.pointerId);
        if (!pointer) return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        const pinch = pinchRef.current;
        const [first, second] = [...touchPointersRef.current.values()];
        if (!pinch || !first || !second) {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setViewport((current) => ({
            ...current,
            x: drag.panX + event.clientX - drag.x,
            y: drag.panY + event.clientY - drag.y,
          }));
          return;
        }
        const point = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const currentDistance = Math.hypot(second.x - first.x, second.y - first.y);
        if (Math.abs(currentDistance - pinch.distance) < PINCH_PAN_THRESHOLD_PX) {
          setViewport({
            ...pinch.viewport,
            x: pinch.viewport.x + point.x - pinch.point.x,
            y: pinch.viewport.y + point.y - pinch.point.y,
          });
          return;
        }
        setViewport(
          pinchCanvasViewport(
            pinch.viewport,
            pinch.point,
            point,
            pinch.distance,
            currentDistance,
            PINCH_ZOOM_EXPONENT,
          ),
        );
        return;
      }
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setViewport((current) => ({
        ...current,
        x: drag.panX + event.clientX - drag.x,
        y: drag.panY + event.clientY - drag.y,
      }));
    },
    [setViewport],
  );
  const endPointerDrag: PointerEventHandler<HTMLDivElement> = useCallback((event) => {
    if (event.pointerType === "touch") {
      touchPointersRef.current.delete(event.pointerId);
      pinchRef.current = null;
      if (touchPointersRef.current.size === 1) {
        const [pointerId, pointer] = touchPointersRef.current.entries().next().value as [
          number,
          TouchPointer,
        ];
        dragRef.current = {
          pointerId,
          x: pointer.x,
          y: pointer.y,
          panX: viewportRef.current.x,
          panY: viewportRef.current.y,
        };
      }
      return;
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);
  const zoomAtCenter = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      const point = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
      setViewport((current) => zoomCanvasViewportAt(current, current.zoom * factor, point));
    },
    [containerRef, setViewport],
  );

  return { viewport, setViewport, onPointerDown, onPointerMove, endPointerDrag, zoomAtCenter };
}
