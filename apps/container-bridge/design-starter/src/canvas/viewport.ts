export const MIN_CANVAS_ZOOM = 0.1;
export const MAX_CANVAS_ZOOM = 2;
const WHEEL_ZOOM_SENSITIVITY = 0.004;
const GESTURE_ZOOM_EXPONENT = 1.75;

export type CanvasViewport = {
  zoom: number;
  x: number;
  y: number;
};

export type CanvasPoint = {
  x: number;
  y: number;
};

export function clampCanvasZoom(zoom: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
}

export function panCanvasViewport(
  viewport: CanvasViewport,
  deltaX: number,
  deltaY: number,
): CanvasViewport {
  return { ...viewport, x: viewport.x - deltaX, y: viewport.y - deltaY };
}

export function zoomCanvasViewportAt(
  viewport: CanvasViewport,
  requestedZoom: number,
  point: CanvasPoint,
): CanvasViewport {
  const zoom = clampCanvasZoom(requestedZoom);
  const worldX = (point.x - viewport.x) / viewport.zoom;
  const worldY = (point.y - viewport.y) / viewport.zoom;
  return {
    zoom,
    x: point.x - worldX * zoom,
    y: point.y - worldY * zoom,
  };
}

export function zoomFromWheel(viewport: CanvasViewport, deltaY: number, point: CanvasPoint) {
  return zoomCanvasViewportAt(
    viewport,
    viewport.zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY),
    point,
  );
}

export function acceleratedGestureScale(scale: number): number {
  return Math.pow(scale, GESTURE_ZOOM_EXPONENT);
}

export function wheelDeltaPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}
