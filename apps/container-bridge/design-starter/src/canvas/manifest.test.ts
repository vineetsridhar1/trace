import assert from "node:assert/strict";
import test from "node:test";
import { validateDesignManifest } from "./manifest";

const validManifest = {
  version: 1,
  sections: [{ id: "main", name: "Main", screenIds: ["home"] }],
  screens: [
    {
      id: "home",
      name: "Home",
      component: "./screens/Home.tsx",
      viewport: { width: 390, height: 844 },
    },
  ],
};

test("validates a complete design manifest", () => {
  assert.deepEqual(validateDesignManifest(validManifest).screens[0]?.id, "home");
});

test("rejects duplicate and unassigned screens", () => {
  assert.throws(
    () =>
      validateDesignManifest({
        ...validManifest,
        screens: [...validManifest.screens, { ...validManifest.screens[0] }],
      }),
    /Duplicate screen id/,
  );
  assert.throws(
    () => validateDesignManifest({ ...validManifest, sections: [] }),
    /not assigned to a section/,
  );
});

test("constrains component paths to the design screen directory", () => {
  assert.throws(
    () =>
      validateDesignManifest({
        ...validManifest,
        screens: [{ ...validManifest.screens[0], component: "../canvas/DesignCanvas.tsx" }],
      }),
    /must reference/,
  );
});
