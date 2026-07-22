import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
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
type PanOrigin = { x: number; y: number; panX: number; panY: number };

export function usePreviewViewport(contentSize?: Size, frameMargin = PREVIEW_FRAME_MARGIN) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const resizeOriginRef = useRef<ResizeOrigin | null>(null);
  const panOriginRef = useRef<PanOrigin | null>(null);
  const [canvasSize, setCanvasSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size>(PREVIEW_PRESETS.desktop);
  const [scaleReference, setScaleReference] = useState<Size>(PREVIEW_PRESETS.desktop);
  const [activePreset, setActivePreset] = useState<PreviewPreset | null>("desktop");
  const [resizing, setResizing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

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

  useEffect(() => {
    if (!contentSize) return;
    setViewportSize(contentSize);
    setScaleReference(contentSize);
    setActivePreset(null);
    setPan({ x: 0, y: 0 });
  }, [contentSize?.height, contentSize?.width]);

  const availableWidth = Math.max(
    0,
    canvasSize.width - CANVAS_GUTTER * 2 - frameMargin * 2,
  );
  const availableHeight = Math.max(
    0,
    canvasSize.height - CANVAS_GUTTER * 2 - frameMargin * 2,
  );
  const fitScale =
    availableWidth > 0 && availableHeight > 0
      ? Math.min(1, availableWidth / scaleReference.width, availableHeight / scaleReference.height)
      : 1;
  const scale = fitScale * zoom;
  const displayedHeight = viewportSize.height * scale;
  const displayedWidth = viewportSize.width * scale;
  const maxViewportWidth = scale > 0 ? availableWidth / scale : viewportSize.width;
  const maxViewportHeight = scale > 0 ? availableHeight / scale : viewportSize.height;

  const selectPreset = useCallback((preset: PreviewPreset) => {
    const size = PREVIEW_PRESETS[preset];
    setViewportSize(size);
    setScaleReference(size);
    setActivePreset(preset);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => setZoom((value) => Math.min(4, value + 0.1)), []);
  const zoomOut = useCallback(() => setZoom((value) => Math.max(0.25, value - 0.1)), []);
  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomAtPoint = useCallback(
    (nextZoom: number, point: Size) => {
      const clampedZoom = Math.min(4, Math.max(0.1, nextZoom));
      const nextScale = fitScale * clampedZoom;
      const currentLeft = (canvasSize.width - displayedWidth) / 2 + pan.x;
      const currentTop = (canvasSize.height - displayedHeight) / 2 + pan.y;
      const worldX = (point.width - currentLeft) / scale;
      const worldY = (point.height - currentTop) / scale;
      const nextWidth = viewportSize.width * nextScale;
      const nextHeight = viewportSize.height * nextScale;
      setZoom(clampedZoom);
      setPan({
        x: point.width - worldX * nextScale - (canvasSize.width - nextWidth) / 2,
        y: point.height - worldY * nextScale - (canvasSize.height - nextHeight) / 2,
      });
    },
    [canvasSize, displayedHeight, displayedWidth, fitScale, pan, scale, viewportSize],
  );

  const handleCanvasWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = event.currentTarget.getBoundingClientRect();
        zoomAtPoint(zoom * Math.exp(-event.deltaY * 0.004), {
          width: event.clientX - bounds.left,
          height: event.clientY - bounds.top,
        });
        return;
      }
      setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
    },
    [zoom, zoomAtPoint],
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      panOriginRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      setPanning(true);
    },
    [pan.x, pan.y],
  );

  const handleCanvasPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const origin = panOriginRef.current;
    if (!origin) return;
    setPan({ x: origin.panX + event.clientX - origin.x, y: origin.panY + event.clientY - origin.y });
  }, []);

  const handleCanvasPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panOriginRef.current = null;
    setPanning(false);
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
    canvasSize,
    displayedHeight,
    displayedWidth,
    handleResizeEnd,
    handleResizeKeyDown,
    handleResizeMove,
    handleResizeStart,
    handleCanvasPointerDown,
    handleCanvasPointerEnd,
    handleCanvasPointerMove,
    handleCanvasWheel,
    pan,
    panning,
    ready: canvasSize.width > 0 && canvasSize.height > 0,
    resizing,
    scale,
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    selectPreset,
    viewportSize,
  };
}
