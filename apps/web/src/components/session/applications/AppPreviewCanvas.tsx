import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitor, RotateCw, Smartphone } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { AppPreviewFrameControls } from "./AppPreviewFrameControls";
import { AppPreviewLoadingBar } from "./AppPreviewLoadingBar";

const CANVAS_GUTTER = 32;
const FRAME_MARGIN = 8;
const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 480;

const PRESETS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

type PreviewPreset = keyof typeof PRESETS;
type Size = { width: number; height: number };
type ResizeOrigin = Size & { x: number; y: number };

function roundedSize(size: Size): Size {
  return { width: Math.round(size.width), height: Math.round(size.height) };
}

export function AppPreviewCanvas({
  url,
  frameRevision,
  loaded,
  refreshing,
  status,
  onLoad,
  onReload,
}: {
  url: string | null;
  frameRevision: number;
  loaded: boolean;
  refreshing: boolean;
  status: string;
  onLoad: () => void;
  onReload: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const resizeOriginRef = useRef<ResizeOrigin | null>(null);
  const [canvasSize, setCanvasSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size>(PRESETS.desktop);
  const [scaleReference, setScaleReference] = useState<Size>(PRESETS.desktop);
  const [activePreset, setActivePreset] = useState<PreviewPreset | null>("desktop");
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const next = { width: canvas.clientWidth, height: canvas.clientHeight };
      setCanvasSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const availableWidth = Math.max(0, canvasSize.width - CANVAS_GUTTER * 2 - FRAME_MARGIN * 2);
  const availableHeight = Math.max(0, canvasSize.height - CANVAS_GUTTER * 2 - FRAME_MARGIN * 2);
  const scale =
    availableWidth > 0 && availableHeight > 0
      ? Math.min(1, availableWidth / scaleReference.width, availableHeight / scaleReference.height)
      : 1;
  const maxViewportWidth = scale > 0 ? availableWidth / scale : viewportSize.width;
  const maxViewportHeight = scale > 0 ? availableHeight / scale : viewportSize.height;
  const displayedWidth = viewportSize.width * scale;
  const displayedHeight = viewportSize.height * scale;
  const ready = canvasSize.width > 0 && canvasSize.height > 0;

  const selectPreset = useCallback((preset: PreviewPreset) => {
    const size = PRESETS[preset];
    setViewportSize(size);
    setScaleReference(size);
    setActivePreset(preset);
  }, []);

  const handleResizeStart = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
        ...viewportSize,
      };
      setActivePreset(null);
      setResizing(true);
    },
    [viewportSize],
  );

  const handleResizeMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const origin = resizeOriginRef.current;
      if (!origin) return;
      const next = roundedSize({
        width: Math.min(
          maxViewportWidth,
          Math.max(MIN_VIEWPORT_WIDTH, origin.width + (event.clientX - origin.x) / scale),
        ),
        height: Math.min(
          maxViewportHeight,
          Math.max(MIN_VIEWPORT_HEIGHT, origin.height + (event.clientY - origin.y) / scale),
        ),
      });
      setViewportSize(next);
    },
    [maxViewportHeight, maxViewportWidth, scale],
  );

  const handleResizeEnd = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeOriginRef.current = null;
    setResizing(false);
  }, []);

  return (
    <div className="relative flex h-full flex-col bg-surface-deep">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {viewportSize.width} × {viewportSize.height}
        </span>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
          <Button
            size="icon-xs"
            variant="ghost"
            title="Desktop preview"
            aria-label="Desktop preview"
            aria-pressed={activePreset === "desktop"}
            className={cn(activePreset === "desktop" && "bg-surface-hover text-foreground")}
            onClick={() => selectPreset("desktop")}
          >
            <Monitor size={13} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            title="Mobile preview"
            aria-label="Mobile preview"
            aria-pressed={activePreset === "mobile"}
            className={cn(activePreset === "mobile" && "bg-surface-hover text-foreground")}
            onClick={() => selectPreset("mobile")}
          >
            <Smartphone size={13} />
          </Button>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onReload}
          disabled={refreshing}
          title="Reload preview"
        >
          <RotateCw size={13} className={cn(refreshing && "animate-spin")} />
        </Button>
      </div>

      <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden">
        {ready ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div
              className={cn(
                "relative shrink-0 overflow-visible rounded-lg rounded-tl-none bg-background p-2 shadow-2xl",
                resizing && "select-none",
              )}
              style={{
                width: displayedWidth + FRAME_MARGIN * 2,
                height: displayedHeight + FRAME_MARGIN * 2,
              }}
            >
              <AppPreviewFrameControls url={url} status={status} />
              {!loaded ? (
                <div className="absolute left-2 right-2 top-1.5 z-20">
                  <AppPreviewLoadingBar />
                </div>
              ) : null}
              <div className="size-full overflow-hidden rounded-md bg-muted/20">
                {url ? (
                  <iframe
                    key={frameRevision}
                    src={url}
                    title="Live app preview"
                    onLoad={onLoad}
                    className={cn(
                      "block origin-top-left border-0 bg-background",
                      !loaded && "opacity-0",
                      resizing && "pointer-events-none",
                    )}
                    style={{
                      width: viewportSize.width,
                      height: viewportSize.height,
                      transform: `scale(${scale})`,
                    }}
                    sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                  />
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Resize preview"
                title="Drag to resize preview"
                onPointerDown={handleResizeStart}
                onPointerMove={handleResizeMove}
                onPointerUp={handleResizeEnd}
                onPointerCancel={handleResizeEnd}
                className="absolute -bottom-2 -right-2 z-10 size-4 cursor-nwse-resize touch-none rounded-full border border-border bg-foreground shadow-sm transition-transform hover:scale-125"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
