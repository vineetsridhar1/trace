import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CanvasToolbar } from "./CanvasToolbar";
import { DesignArtboard } from "./DesignArtboard";
import type { DesignManifest, DesignScreen } from "./manifest";

const GAP = 96;
const SECTION_GAP = 180;

type PlacedScreen = { screen: DesignScreen; x: number; y: number; sectionName: string };

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
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

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
      setZoom(nextZoom);
      setPan({
        x: (container.clientWidth - (right - left) * nextZoom) / 2 - left * nextZoom,
        y: (container.clientHeight - (bottom - top) * nextZoom) / 2 - top * nextZoom,
      });
    },
    [placed],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(frame);
  }, [fit]);

  const visible = focusedId ? placed.filter((item) => item.screen.id === focusedId) : placed;

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen cursor-grab overflow-hidden bg-[#111113] active:cursor-grabbing"
      onWheel={(event) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          setZoom((value) => Math.min(2, Math.max(0.1, value * Math.exp(-event.deltaY * 0.002))));
        } else {
          setPan((value) => ({ x: value.x - event.deltaX, y: value.y - event.deltaY }));
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(#71717a_1px,transparent_1px)] [background-size:24px_24px]" />
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {visible.map(({ screen, x, y, sectionName }) => {
          const key = `./design/${screen.component.slice(2)}`;
          const component = moduleComponent(screenModules[key]);
          return (
            <div key={screen.id} className="absolute" style={{ left: x, top: y }}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                {sectionName}
              </p>
              {component ? (
                <DesignArtboard
                  screen={screen}
                  component={component}
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
        zoom={zoom}
        focused={focusedId !== null}
        onZoomIn={() => setZoom((value) => Math.min(2, value * 1.2))}
        onZoomOut={() => setZoom((value) => Math.max(0.1, value / 1.2))}
        onFit={() => fit(focusedId ?? undefined)}
        onClearFocus={() => {
          setFocusedId(null);
          requestAnimationFrame(() => fit());
        }}
      />
    </div>
  );
}
