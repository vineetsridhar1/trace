import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CANVAS_ZOOM,
  MAX_LABEL_CANVAS_FONT_SIZE,
  MIN_CANVAS_ZOOM,
  acceleratedGestureScale,
  isCanvasLabelVisible,
  panCanvasViewport,
  pinchCanvasViewport,
  wheelDeltaPixels,
  zoomCanvasViewportAt,
  zoomFromWheel,
} from "./viewport";

test("pans by two-axis trackpad deltas", () => {
  assert.deepEqual(panCanvasViewport({ zoom: 1, x: 100, y: 80 }, 24, -12), {
    zoom: 1,
    x: 76,
    y: 92,
  });
});

test("keeps the world point under the pointer fixed while zooming", () => {
  const point = { x: 300, y: 240 };
  const before = { zoom: 0.5, x: 100, y: 40 };
  const worldPoint = {
    x: (point.x - before.x) / before.zoom,
    y: (point.y - before.y) / before.zoom,
  };
  const after = zoomCanvasViewportAt(before, 1.25, point);

  assert.equal(after.x + worldPoint.x * after.zoom, point.x);
  assert.equal(after.y + worldPoint.y * after.zoom, point.y);
});

test("keeps two-finger panning anchored between the fingers", () => {
  const viewport = { zoom: 1, x: 20, y: 30 };
  const next = pinchCanvasViewport(viewport, { x: 100, y: 100 }, { x: 140, y: 120 }, 80, 80);

  assert.deepEqual(next, { zoom: 1, x: 60, y: 50 });
});

test("supports a faster pinch response", () => {
  const next = pinchCanvasViewport(
    { zoom: 1, x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 100, y: 100 },
    100,
    120,
    1.5,
  );

  assert.equal(next.zoom, Math.pow(1.2, 1.5));
});

test("clamps wheel zoom without moving the pointer anchor", () => {
  const viewport = { zoom: 1, x: 0, y: 0 };
  assert.equal(zoomFromWheel(viewport, -100_000, { x: 0, y: 0 }).zoom, MAX_CANVAS_ZOOM);
  assert.equal(zoomFromWheel(viewport, 100_000, { x: 0, y: 0 }).zoom, MIN_CANVAS_ZOOM);
});

test("uses responsive zoom for trackpad pinch gestures", () => {
  const viewport = { zoom: 1, x: 0, y: 0 };
  const zoomedIn = zoomFromWheel(viewport, -100, { x: 0, y: 0 }).zoom;
  const zoomedOut = zoomFromWheel(viewport, 100, { x: 0, y: 0 }).zoom;

  assert.ok(zoomedIn > 1.45);
  assert.ok(zoomedOut < 0.7);
  assert.ok(acceleratedGestureScale(1.1) > 1.25);
  assert.ok(acceleratedGestureScale(0.9) < 0.9);
  assert.equal(acceleratedGestureScale(1), 1);
});

test("hides canvas labels once their canvas-space size passes the threshold", () => {
  assert.equal(isCanvasLabelVisible(24, 1), true);
  assert.equal(isCanvasLabelVisible(24, 24 / MAX_LABEL_CANVAS_FONT_SIZE), true);
  assert.equal(isCanvasLabelVisible(24, 24 / MAX_LABEL_CANVAS_FONT_SIZE - 0.01), false);
  assert.equal(isCanvasLabelVisible(24, MIN_CANVAS_ZOOM), false);
  assert.equal(isCanvasLabelVisible(24, 0), false);
});

test("normalizes line and page wheel deltas", () => {
  assert.equal(wheelDeltaPixels(2, 0, 800), 2);
  assert.equal(wheelDeltaPixels(2, 1, 800), 32);
  assert.equal(wheelDeltaPixels(2, 2, 800), 1600);
});
