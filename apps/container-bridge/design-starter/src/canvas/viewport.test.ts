import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  acceleratedGestureScale,
  panCanvasViewport,
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
  assert.ok(acceleratedGestureScale(1.1) > 1.1);
  assert.ok(acceleratedGestureScale(0.9) < 0.9);
  assert.equal(acceleratedGestureScale(1), 1);
});

test("normalizes line and page wheel deltas", () => {
  assert.equal(wheelDeltaPixels(2, 0, 800), 2);
  assert.equal(wheelDeltaPixels(2, 1, 800), 32);
  assert.equal(wheelDeltaPixels(2, 2, 800), 1600);
});
