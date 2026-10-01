import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Popover } from "../../ui/popover";
import { GuideCodeReference } from "./GuideCodeReference";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/urql", () => ({ client: { query } }));
// The test renderer has no portal container. Keep the real root/trigger and render the panel inline.
vi.mock("../../ui/popover", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/popover")>()),
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  query.mockReset();
});
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});
const view = (snapshotId: string) => (
  <GuideCodeReference
    snapshotId={snapshotId}
    filePath="app/[id]/route.ts"
    startLine={4}
    endLine={8}
    label="Route"
  />
);

it("fetches only on open, uses the Guide snapshot, and discards stale snapshot code", async () => {
  query.mockImplementation((_query: unknown, { snapshotId }: { snapshotId: string }) => ({
    toPromise: async () => ({
      data: {
        reviewCodeExcerpt: {
          snapshotId,
          path: "app/[id]/route.ts",
          startLine: 4,
          endLine: 6,
          content: snapshotId === "old" ? "oldSnapshotCode" : "newSnapshotCode",
          addedLines: [],
        },
      },
    }),
  }));
  await act(async () => {
    renderer = create(view("old"));
  });
  expect(query).not.toHaveBeenCalled();
  await act(async () => renderer.root.findByType(Popover).props.onOpenChange(true));
  expect(query.mock.calls[0]?.[1]).toEqual({
    snapshotId: "old",
    filePath: "app/[id]/route.ts",
    startLine: 4,
    endLine: 8,
  });
  expect(JSON.stringify(renderer.toJSON())).toContain("oldSnapshotCode");
  expect(JSON.stringify(renderer.toJSON())).toContain("–6");
  await act(async () => renderer.update(view("new")));
  expect(JSON.stringify(renderer.toJSON())).not.toContain("oldSnapshotCode");
  expect(JSON.stringify(renderer.toJSON())).toContain("newSnapshotCode");
});

it("shows an unavailable-code error without inventing a preview", async () => {
  query.mockReturnValue({ toPromise: async () => ({ error: { message: "Source unavailable" } }) });
  await act(async () => {
    renderer = create(view("old"));
  });
  await act(async () => renderer.root.findByType(Popover).props.onOpenChange(true));
  expect(JSON.stringify(renderer.toJSON())).toContain("Source unavailable");
});
