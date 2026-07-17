import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasToolbar } from "./CanvasToolbar";
import { DesignArtboard } from "./DesignArtboard";
import { placeScreens } from "./layout";
import type { DesignManifest } from "./manifest";
import { resolveScreenComponent } from "./screen-modules";
import { useCanvasViewport } from "./useCanvasViewport";

export function DesignCanvas({
  manifest,
  screenModules,
}: {
  manifest: DesignManifest;
  screenModules: Record<string, unknown>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { viewport, setViewport, onPointerDown, onPointerMove, endPointerDrag, zoomAtCenter } =
    useCanvasViewport(containerRef);

  const placed = useMemo(() => placeScreens(manifest), [manifest]);

  const fit = useCallback(
    (screenId?: string) => {
      const container = containerRef.current;
      if (!container || placed.length === 0) return;
      const targets = screenId ? placed.filter((item) => item.screen.id === screenId) : placed;
      const left = Math.min(...targets.map((item) => item.x));
      const top = Math.min(...targets.map((item) => item.y));
      const right = Math.max(...targets.map((item) => item.x + item.screen.viewport.width));
      const bottom = Math.max(...targets.map((item) => item.y + item.screen.viewport.height));
      const padding = screenId ? 160 : 140;
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

  const visible = focusedId ? placed.filter((item) => item.screen.id === focusedId) : placed;

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen cursor-grab touch-none overflow-hidden overscroll-none bg-[#111113] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={endPointerDrag}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(#71717a_1px,transparent_1px)] [background-size:24px_24px]" />
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {visible.map(({ screen, x, y, sectionName }) => {
          const component = resolveScreenComponent(screenModules, screen.component);
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
        onZoomIn={() => zoomAtCenter(1.2)}
        onZoomOut={() => zoomAtCenter(1 / 1.2)}
        onFit={() => fit(focusedId ?? undefined)}
        onClearFocus={() => {
          setFocusedId(null);
          requestAnimationFrame(() => fit());
        }}
      />
    </div>
  );
}
