import assert from "node:assert/strict";
import test from "node:test";
import { placeScreens } from "./layout";

test("lays out screens as rows and stacks sections vertically when positions are omitted", () => {
  const placed = placeScreens({
    version: 1,
    sections: [
      { id: "flow", name: "Flow", screenIds: ["first", "second"] },
      { id: "states", name: "States", screenIds: ["third"] },
    ],
    screens: [
      {
        id: "first",
        name: "First",
        component: "./screens/First.tsx",
        viewport: { width: 400, height: 800 },
      },
      {
        id: "second",
        name: "Second",
        component: "./screens/Second.tsx",
        viewport: { width: 400, height: 600 },
      },
      {
        id: "third",
        name: "Third",
        component: "./screens/Third.tsx",
        viewport: { width: 400, height: 500 },
      },
    ],
  });

  assert.deepEqual(
    placed.map(({ x, y }) => ({ x, y })),
    [
      { x: 0, y: 54 },
      { x: 496, y: 54 },
      { x: 0, y: 1088 },
    ],
  );
});

test("keeps explicit screen coordinates relative to its section row", () => {
  const [placed] = placeScreens({
    version: 1,
    sections: [{ id: "main", name: "Main", screenIds: ["screen"] }],
    screens: [
      {
        id: "screen",
        name: "Screen",
        component: "./screens/Screen.tsx",
        viewport: { width: 400, height: 800 },
        position: { x: 120, y: 32 },
      },
    ],
  });

  assert.deepEqual({ x: placed?.x, y: placed?.y }, { x: 120, y: 32 });
});
