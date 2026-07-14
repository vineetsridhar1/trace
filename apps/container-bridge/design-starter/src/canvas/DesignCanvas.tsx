import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CanvasToolbar } from "./CanvasToolbar";
import { DesignArtboard } from "./DesignArtboard";
import type { DesignManifest, DesignScreen } from "./manifest";
import {
  type CanvasPoint,
  type CanvasViewport,
  panCanvasViewport,
  wheelDeltaPixels,
  zoomCanvasViewportAt,
  zoomFromWheel,
} from "./viewport";

const GAP = 96;
const SECTION_GAP = 180;

type PlacedScreen = { screen: DesignScreen; x: number; y: number; sectionName: string };
type WebKitGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

const INITIAL_VIEWPORT: CanvasViewport = { zoom: 0.75, x: 100, y: 100 };

function moduleComponent(value: unknown): ComponentType | null {
  if (!value || typeof value !== "object" || !("default" in value)) return null;
  const component = (value as { default?: unknown }).default;
  return typeof component === "function" ? (component as ComponentType) : null;
}

export function DesignCanvas({
  manifest,
  screenModules,
}: {
  manifest: DesignManifest;
  screenModules: Record<string, unknown>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewportState] = useState(INITIAL_VIEWPORT);
  const viewportRef = useRef(viewport);
  const [focusedId, setFocusedId] = useState<string | null>(null);
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

  const placed = useMemo(() => {
    const byId = new Map(manifest.screens.map((screen) => [screen.id, screen]));
    let sectionX = 0;
    const result: PlacedScreen[] = [];
    for (const section of manifest.sections) {
      let fallbackX = sectionX;
      let maxRight = sectionX;
      for (const id of section.screenIds) {
        const screen = byId.get(id)!;
        const x = screen.position ? sectionX + screen.position.x : fallbackX;
        const y = screen.position?.y ?? 54;
        result.push({ screen, x, y, sectionName: section.name });
        fallbackX = x + screen.viewport.width + GAP;
        maxRight = Math.max(maxRight, x + screen.viewport.width);
      }
      sectionX = maxRight + SECTION_GAP;
    }
    return result;
  }, [manifest]);

  const fit = useCallback(
    (screenId?: string) => {
      const container = containerRef.current;
      if (!container || placed.length === 0) return;
      const targets = screenId ? placed.filter((item) => item.screen.id === screenId) : placed;
      const left = Math.min(...targets.map((item) => item.x));
      const top = Math.min(...targets.map((item) => item.y));
      const right = Math.max(...targets.map((item) => item.x + item.screen.viewport.width));
      const bottom = Math.max(...targets.map((item) => item.y + item.screen.viewport.height));
      const padding = screenId ? 80 : 140;
      const nextZoom = Math.min(
        1.25,
        Math.max(
          0.1,
          Math.min(
            (container.clientWidth - padding) / (right - left),
            (container.clientHeight - padding) / (bottom - top),
          ),
        ),
      );
      setViewport({
        zoom: nextZoom,
        x: (container.clientWidth - (right - left) * nextZoom) / 2 - left * nextZoom,
        y: (container.clientHeight - (bottom - top) * nextZoom) / 2 - top * nextZoom,
      });
    },
    [placed, setViewport],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(frame);
  }, [fit]);

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
        const point = pointInCanvas(event.clientX, event.clientY);
        setViewport((current) => zoomFromWheel(current, deltaY, point));
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
      if (!start) return;
      const scale = (event as WebKitGestureEvent).scale;
      if (typeof scale !== "number" || !Number.isFinite(scale)) return;
      setViewport(zoomCanvasViewportAt(start.viewport, start.viewport.zoom * scale, start.point));
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
  }, [setViewport]);

  const visible = focusedId ? placed.filter((item) => item.screen.id === focusedId) : placed;

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen cursor-grab touch-none overflow-hidden overscroll-none bg-[#111113] active:cursor-grabbing"
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          panX: viewport.x,
          panY: viewport.y,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        setViewport((current) => ({
          ...current,
          x: drag.panX + event.clientX - drag.x,
          y: drag.panY + event.clientY - drag.y,
        }));
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(#71717a_1px,transparent_1px)] [background-size:24px_24px]" />
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {visible.map(({ screen, x, y, sectionName }) => {
          const key = `./design/${screen.component.slice(2)}`;
          const component = moduleComponent(screenModules[key]);
          return (
            <div key={screen.id} className="absolute" style={{ left: x, top: y }}>
              {component ? (
                <DesignArtboard
                  screen={screen}
                  sectionName={sectionName}
                  component={component}
                  zoom={viewport.zoom}
                  onFocus={() => {
                    setFocusedId(screen.id);
                    requestAnimationFrame(() => fit(screen.id));
                  }}
                />
              ) : (
                <div
                  className="flex items-center justify-center bg-rose-950/50 p-8 text-sm text-rose-200"
                  style={{ width: screen.viewport.width, height: screen.viewport.height }}
                >
                  Missing component: {screen.component}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <CanvasToolbar
        zoom={viewport.zoom}
        focused={focusedId !== null}
        onZoomIn={() => {
          const container = containerRef.current;
          if (!container) return;
          const point = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
          setViewport((current) => zoomCanvasViewportAt(current, current.zoom * 1.2, point));
        }}
        onZoomOut={() => {
          const container = containerRef.current;
          if (!container) return;
          const point = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
          setViewport((current) => zoomCanvasViewportAt(current, current.zoom / 1.2, point));
        }}
        onFit={() => fit(focusedId ?? undefined)}
        onClearFocus={() => {
          setFocusedId(null);
          requestAnimationFrame(() => fit());
        }}
      />
    </div>
  );
}
