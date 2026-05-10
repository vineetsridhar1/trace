import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { PointerEvent } from "react";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

export type FeedbackCanvasHandle = {
  clear: () => void;
  undo: () => void;
  toBlob: () => Promise<Blob>;
};

export const FeedbackCanvas = forwardRef<
  FeedbackCanvasHandle,
  { screenshot: DesktopFeedbackScreenshot }
>(function FeedbackCanvas({ screenshot }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) drawStroke(context, stroke);
    if (activeStrokeRef.current) drawStroke(context, activeStrokeRef.current);
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = screenshot.width;
      canvas.height = screenshot.height;
      strokesRef.current = [];
      activeStrokeRef.current = null;
      redraw();
    };
    image.src = screenshot.dataUrl;
  }, [redraw, screenshot]);

  const getCanvasPoint = useCallback((event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const width = Math.max(8, Math.round(screenshot.width / 180));
      activeStrokeRef.current = { points: [getCanvasPoint(event)], color: "#ff3b30", width };
      redraw();
    },
    [getCanvasPoint, redraw, screenshot.width],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(getCanvasPoint(event));
      redraw();
    },
    [getCanvasPoint, redraw],
  );

  const finishStroke = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const stroke = activeStrokeRef.current;
      if (!stroke) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      activeStrokeRef.current = null;
      if (stroke.points.length > 1) strokesRef.current.push(stroke);
      redraw();
    },
    [redraw],
  );

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        strokesRef.current = [];
        activeStrokeRef.current = null;
        redraw();
      },
      undo: () => {
        strokesRef.current = strokesRef.current.slice(0, -1);
        activeStrokeRef.current = null;
        redraw();
      },
      toBlob: () => {
        const canvas = canvasRef.current;
        if (!canvas) return Promise.reject(new Error("Screenshot is not ready"));
        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Failed to export screenshot"));
            },
            "image/jpeg",
            0.86,
          );
        });
      },
    }),
    [redraw],
  );

  return (
    <canvas
      ref={canvasRef}
      className="max-h-[70dvh] max-w-full touch-none rounded-lg border border-border bg-black shadow-2xl"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
});

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  const [firstPoint, ...points] = stroke.points;
  if (!firstPoint) return;

  context.save();
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);
  for (const point of points) context.lineTo(point.x, point.y);
  context.stroke();
  context.restore();
}
