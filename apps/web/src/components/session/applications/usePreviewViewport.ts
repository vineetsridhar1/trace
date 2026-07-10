import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

const CANVAS_GUTTER = 32;
export const PREVIEW_FRAME_MARGIN = 8;
const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 480;

export const PREVIEW_PRESETS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type PreviewPreset = keyof typeof PREVIEW_PRESETS;
type Size = { width: number; height: number };
type ResizeOrigin = Size & { x: number; y: number };

export function usePreviewViewport() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const resizeOriginRef = useRef<ResizeOrigin | null>(null);
  const [canvasSize, setCanvasSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size>(PREVIEW_PRESETS.desktop);
  const [scaleReference, setScaleReference] = useState<Size>(PREVIEW_PRESETS.desktop);
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

  const availableWidth = Math.max(
    0,
    canvasSize.width - CANVAS_GUTTER * 2 - PREVIEW_FRAME_MARGIN * 2,
  );
  const availableHeight = Math.max(
    0,
    canvasSize.height - CANVAS_GUTTER * 2 - PREVIEW_FRAME_MARGIN * 2,
  );
  const scale =
    availableWidth > 0 && availableHeight > 0
      ? Math.min(1, availableWidth / scaleReference.width, availableHeight / scaleReference.height)
      : 1;
  const maxViewportWidth = scale > 0 ? availableWidth / scale : viewportSize.width;
  const maxViewportHeight = scale > 0 ? availableHeight / scale : viewportSize.height;

  const selectPreset = useCallback((preset: PreviewPreset) => {
    const size = PREVIEW_PRESETS[preset];
    setViewportSize(size);
    setScaleReference(size);
    setActivePreset(preset);
  }, []);

  const handleResizeStart = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeOriginRef.current = { x: event.clientX, y: event.clientY, ...viewportSize };
      setActivePreset(null);
      setResizing(true);
    },
    [viewportSize],
  );

  const handleResizeMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const origin = resizeOriginRef.current;
      if (!origin) return;
      setViewportSize({
        width: Math.round(
          Math.min(
            maxViewportWidth,
            Math.max(MIN_VIEWPORT_WIDTH, origin.width + (event.clientX - origin.x) / scale),
          ),
        ),
        height: Math.round(
          Math.min(
            maxViewportHeight,
            Math.max(MIN_VIEWPORT_HEIGHT, origin.height + (event.clientY - origin.y) / scale),
          ),
        ),
      });
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

  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const delta = event.shiftKey ? 50 : 10;
      const widthDelta =
        event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0;
      const heightDelta = event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0;
      if (widthDelta === 0 && heightDelta === 0) return;
      event.preventDefault();
      setActivePreset(null);
      setViewportSize((current) => ({
        width: Math.round(
          Math.min(maxViewportWidth, Math.max(MIN_VIEWPORT_WIDTH, current.width + widthDelta)),
        ),
        height: Math.round(
          Math.min(maxViewportHeight, Math.max(MIN_VIEWPORT_HEIGHT, current.height + heightDelta)),
        ),
      }));
    },
    [maxViewportHeight, maxViewportWidth],
  );

  return {
    activePreset,
    canvasRef,
    displayedHeight: viewportSize.height * scale,
    displayedWidth: viewportSize.width * scale,
    handleResizeEnd,
    handleResizeKeyDown,
    handleResizeMove,
    handleResizeStart,
    ready: canvasSize.width > 0 && canvasSize.height > 0,
    resizing,
    scale,
    selectPreset,
    viewportSize,
  };
}
