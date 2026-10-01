import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewFile } from "@trace/gql";

const query = vi.fn();

vi.mock("../../lib/urql", () => ({ client: { query: (...args: unknown[]) => query(...args) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReviewChangesView } from "./ReviewChangesView";

const FILES: ReviewFile[] = [
  {
    path: "src/retry.ts",
    previousPath: null,
    status: "modified",
    additions: 1,
    deletions: 0,
    patchAvailable: true,
    viewed: false,
    commentCount: 0,
  } as unknown as ReviewFile,
];

function patchFor(snapshotId: string, body: string) {
  return {
    toPromise: () =>
      Promise.resolve({
        data: {
          reviewDiffFile: {
            snapshotId,
            path: "src/retry.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            patch: `@@ -1,1 +1,1 @@\n+${body}\n`,
            truncated: false,
          },
        },
      }),
  };
}

describe("ReviewChangesView snapshot refresh", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Each card loads its patch once it is near the viewport; report it as visible immediately.
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {
          setTimeout(() => this.callback([{ isIntersecting: true }] as never, this as never), 0);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
        root = null;
        rootMargin = "";
        thresholds = [];
      },
    );
    query.mockReset();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
  });

  function view(snapshotId: string) {
    return (
      <ReviewChangesView
        reviewId="review-1"
        snapshotId={snapshotId}
        title="Fix the retry loop"
        description=""
        pullRequestNumber={7}
        files={FILES}
        threads={[]}
        inquiries={[]}
        onRefresh={() => {}}
      />
    );
  }

  function render(snapshotId: string) {
    act(() => {
      // There is no DOM here, so host refs need an explicit node mock for the
      // IntersectionObserver effect to run at all.
      renderer = create(view(snapshotId), { createNodeMock: () => ({}) });
    });
  }

  // Visibility, the patch request, and its render each land on their own tick.
  async function settle() {
    for (let tick = 0; tick < 4; tick += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  it("refetches the patch when the review advances to a new snapshot", async () => {
    query
      .mockReturnValueOnce(patchFor("snapshot-1", "oldCommitLine"))
      .mockReturnValueOnce(patchFor("snapshot-2", "newCommitLine"));

    render("snapshot-1");
    await settle();

    expect(JSON.stringify(renderer?.toJSON())).toContain("oldCommitLine");

    act(() => {
      renderer?.update(view("snapshot-2"));
    });
    await settle();

    // A stale patch here means comments would anchor to the previous commit's line numbers.
    const rendered = JSON.stringify(renderer?.toJSON());
    expect(rendered).toContain("newCommitLine");
    expect(rendered).not.toContain("oldCommitLine");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ snapshotId: "snapshot-2" }),
    );
  });
});
