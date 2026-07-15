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
  wheelDeltaPixels,
  zoomCanvasViewportAt,
  zoomFromWheel,
} from "./viewport";

type WebKitGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

const INITIAL_VIEWPORT: CanvasViewport = { zoom: 0.75, x: 100, y: 100 };

export function useCanvasViewport(containerRef: RefObject<HTMLDivElement | null>) {
  const [viewport, setViewportState] = useState(INITIAL_VIEWPORT);
  const viewportRef = useRef(viewport);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const gestureRef = useRef<{ viewport: CanvasViewport; point: CanvasPoint } | null>(null);

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

  const onPointerDown: PointerEventHandler<HTMLDivElement> = useCallback((event) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: viewportRef.current.x,
      panY: viewportRef.current.y,
    };
  }, []);
  const onPointerMove: PointerEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      setViewport((current) => ({
        ...current,
        x: drag.panX + event.clientX - drag.x,
        y: drag.panY + event.clientY - drag.y,
      }));
    },
    [setViewport],
  );
  const endPointerDrag = useCallback(() => {
    dragRef.current = null;
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
