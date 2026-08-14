import { useCallback, useEffect, useMemo, useRef } from "react";
import { CanvasToolbar } from "./CanvasToolbar";
import { DesignArtboard } from "./DesignArtboard";
import { DesignSectionLabel, SECTION_LABEL_GAP } from "./DesignSectionLabel";
import { isPlacedScreenVisible, placeScreens } from "./layout";
import type { DesignManifest } from "./manifest";
import { resolveScreenComponent } from "./screen-modules";
import { useCanvasViewport } from "./useCanvasViewport";

const ARTBOARD_OVERSCAN_PX = 480;

export function DesignCanvas({
  manifest,
  preview = false,
  screenModules,
}: {
  manifest: DesignManifest;
  preview?: boolean;
  screenModules: Record<string, unknown>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewport, setViewport, onPointerDown, onPointerMove, endPointerDrag, zoomAtCenter } =
    useCanvasViewport(containerRef);

  const placed = useMemo(() => placeScreens(manifest), [manifest]);

  const fit = useCallback(() => {
    const container = containerRef.current;
    if (!container || placed.length === 0) return;
    const targets = placed;
    const left = Math.min(...targets.map((item) => item.x));
    const top = Math.min(...targets.map((item) => item.y));
    const right = Math.max(...targets.map((item) => item.x + item.screen.viewport.width));
    const bottom = Math.max(...targets.map((item) => item.y + item.screen.viewport.height));
    const padding = 140;
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
  }, [placed, setViewport]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(frame);
  }, [fit]);

  const visible = useMemo(() => {
    const container = containerRef.current;
    if (!container) return placed;
    return placed.filter((item) =>
      isPlacedScreenVisible(
        item,
        viewport,
        { width: container.clientWidth, height: container.clientHeight },
        ARTBOARD_OVERSCAN_PX,
      ),
    );
  }, [placed, viewport]);
  const sectionLabels = Array.from(
    visible.reduce((labels, item) => {
      const existing = labels.get(item.sectionId);
      if (!existing || item.y < existing.y || (item.y === existing.y && item.x < existing.x)) {
        labels.set(item.sectionId, item);
      }
      return labels;
    }, new Map<string, (typeof visible)[number]>()),
  );
  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen cursor-grab touch-none overflow-hidden overscroll-none bg-[#111113] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={endPointerDrag}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(#71717a_1px,transparent_1px)] [background-size:24px_24px]"
        style={{ backgroundPosition: `${viewport.x * 0.25}px ${viewport.y * 0.25}px` }}
      />
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {sectionLabels.map(([sectionId, item]) => (
          <div
            key={sectionId}
            className="pointer-events-none absolute h-0"
            style={{ left: item.x, top: item.y - SECTION_LABEL_GAP / viewport.zoom }}
          >
            <DesignSectionLabel
              name={item.sectionName}
              zoom={viewport.zoom}
              clearanceAbove={item.clearanceAbove}
            />
          </div>
        ))}
        {visible.map(({ screen, x, y, clearanceAbove }) => {
          const component = resolveScreenComponent(screenModules, screen.component);
          return (
            <div key={screen.id} className="absolute" style={{ left: x, top: y }}>
              {component ? (
                <DesignArtboard
                  screen={screen}
                  component={component}
                  zoom={viewport.zoom}
                  clearanceAbove={clearanceAbove}
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
      {!preview ? (
        <CanvasToolbar
          zoom={viewport.zoom}
          onZoomIn={() => zoomAtCenter(1.2)}
          onZoomOut={() => zoomAtCenter(1 / 1.2)}
          onFit={fit}
        />
      ) : null}
    </div>
  );
}
