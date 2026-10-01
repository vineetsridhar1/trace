import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReviewUiStore } from "../../stores/review-ui";
import { useEntityStore } from "@trace/client-core";
import type { ReviewFile, ReviewThread } from "@trace/gql";

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
  let threads: ReviewThread[] = [];
  const listeners = new Set<() => void>();
  const scrollNode = {
    scrollTop: 0,
    clientHeight: 600,
    offsetHeight: 600,
    offsetWidth: 1000,
    scrollHeight: 10000000,
    ownerDocument: {
      defaultView: {
        setTimeout,
        clearTimeout,
        requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
        cancelAnimationFrame: clearTimeout,
      },
    },
    addEventListener: (event: string, callback: () => void) => {
      if (event === "scroll") listeners.add(callback);
    },
    removeEventListener: (_event: string, callback: () => void) => {
      listeners.delete(callback);
    },
    scrollTo: ({ top }: { top: number }) => {
      if (scrollNode.scrollTop === top) return;
      scrollNode.scrollTop = top;
      listeners.forEach((callback) => callback());
    },
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    useReviewUiStore.setState({ byReviewId: {}, replyDrafts: {} });
    useEntityStore.setState({ reviewThreads: {} });
    threads = [];
    scrollNode.scrollTop = 0;
    listeners.clear();
    query.mockReset();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
  });

  function view(snapshotId: string, files = FILES) {
    return (
      <ReviewChangesView
        reviewId="review-1"
        snapshotId={snapshotId}
        title="Fix the retry loop"
        description=""
        pullRequestNumber={7}
        files={files}
        threads={threads}
        inquiries={[]}
        onRefresh={() => {}}
      />
    );
  }

  function render(snapshotId: string, files = FILES) {
    act(() => {
      // There is no DOM here, so host refs need an explicit node mock for the
      // IntersectionObserver effect to run at all.
      renderer = create(view(snapshotId, files), {
        createNodeMock: (element) =>
          typeof element.props === "object" &&
          element.props !== null &&
          "data-review-scroll" in element.props
            ? scrollNode
            : null,
      });
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
  it.each([
    { status: "removed", additions: 0, deletions: 80 },
    { status: "modified", additions: 500, deletions: 500 },
  ])("defers $status patches until expanded and releases them on collapse", async (metadata) => {
    const files = [{ ...FILES[0]!, ...metadata }];
    query.mockImplementation((_query: unknown, variables: { snapshotId: string }) =>
      patchFor(variables.snapshotId, "loadedCode"),
    );
    render("snapshot-1", files);
    await settle();
    const toggle = () =>
      renderer!.root
        .findAllByType("button")
        .find((node) => node.props["aria-expanded"] !== undefined)!;
    expect(toggle().props["aria-expanded"]).toBe(false);
    expect(query).not.toHaveBeenCalled();

    act(() => toggle().props.onClick());
    await settle();
    expect(toggle().props["aria-expanded"]).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer?.toJSON())).toContain("loadedCode");

    // The explicit expansion survives remounting the snapshot's virtualized file list.
    act(() => renderer?.update(view("snapshot-2", files)));
    await settle();
    expect(toggle().props["aria-expanded"]).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);

    act(() => toggle().props.onClick());
    await settle();
    expect(JSON.stringify(renderer?.toJSON())).not.toContain("loadedCode");
    expect(query).toHaveBeenCalledTimes(2);
    act(() => toggle().props.onClick());
    await settle();
    // Re-expansion fetches again: collapse did not retain the full patch in memory.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("expands a default-collapsed file when navigating directly to a line", async () => {
    const files = [{ ...FILES[0]!, additions: 1000 }];
    query.mockReturnValue(patchFor("snapshot-1", "navigationTarget"));
    render("snapshot-1", files);
    await settle();
    expect(query).not.toHaveBeenCalled();
    act(() =>
      useReviewUiStore.getState().navigate("review-1", {
        filePath: files[0]!.path,
        startLine: 1,
        endLine: 1,
      }),
    );
    await settle();
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer?.toJSON())).toContain("navigationTarget");
  });

  it("keeps diffs below the large-file threshold expanded", async () => {
    query.mockReturnValue(patchFor("snapshot-1", "ordinaryDiff"));
    render("snapshot-1", [{ ...FILES[0]!, additions: 499, deletions: 500 }]);
    await settle();
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer?.toJSON())).toContain("ordinaryDiff");
  });

  it("bounds mounted files and requests for a 20,000-file review and navigates to an unmounted file", async () => {
    const files = Array.from({ length: 20_000 }, (_, index) => ({
      ...FILES[0]!,
      path: `src/file-${index}.ts`,
    }));
    query.mockImplementation((_query: unknown, variables: { snapshotId: string }) =>
      patchFor(variables.snapshotId, "code"),
    );
    render("snapshot-1", files);
    await settle();
    const mountedFiles = () => renderer!.root.findAll((node) => !!node.props["data-review-file"]);
    expect(mountedFiles().length).toBeGreaterThan(0);
    expect(mountedFiles().length).toBeLessThan(10);
    expect(query.mock.calls.length).toBeLessThan(10);
    act(() =>
      useReviewUiStore.getState().patch("review-1", { requestedFilePath: "src/file-19000.ts" }),
    );
    await settle();
    expect(
      mountedFiles().some((node) => node.props["data-review-file"] === "src/file-19000.ts"),
    ).toBe(true);
    expect(mountedFiles().length).toBeLessThan(10);
    expect(useReviewUiStore.getState().byReviewId["review-1"]?.activeFilePath).toBe(
      "src/file-19000.ts",
    );
    expect(mountedFiles().some((node) => node.props["data-review-file"] === "src/file-0.ts")).toBe(
      false,
    );
  });

  it("bounds code rows inside one huge file", async () => {
    query.mockReturnValue(
      patchFor("snapshot-1", Array.from({ length: 50_000 }, (_, i) => `line${i}`).join("\n+")),
    );
    render("snapshot-1");
    await settle();
    const codeRows = renderer!.root.findAll(
      (node) => typeof node.type === "string" && !!node.props.onPointerDown,
    );
    expect(codeRows.length).toBeGreaterThan(0);
    expect(codeRows.length).toBeLessThan(100);
    expect(JSON.stringify(renderer?.toJSON())).not.toContain("line25000");
  });

  it("navigates to a line that was never mounted, then allows scrolling away from the highlight", async () => {
    query.mockReturnValue(
      patchFor("snapshot-1", Array.from({ length: 50_000 }, (_, i) => `line${i + 1}`).join("\n+")),
    );
    render("snapshot-1");
    await settle();
    act(() =>
      useReviewUiStore
        .getState()
        .navigate("review-1", { filePath: FILES[0]!.path, startLine: 25000, endLine: 25000 }),
    );
    await settle();
    expect(JSON.stringify(renderer?.toJSON())).toContain("line25000");
    expect(useReviewUiStore.getState().byReviewId["review-1"]?.requestedLine).toBeNull();
    act(() => scrollNode.scrollTo({ top: 2000 }));
    await settle();
    expect(scrollNode.scrollTop).toBe(2000);
    expect(JSON.stringify(renderer?.toJSON())).not.toContain('"line25000"');
  });

  it("preserves an unsent reply when its anchored thread scrolls out and remounts", async () => {
    const thread = {
      id: "thread",
      scope: "line",
      comments: [],
      deliveryStatus: "trace_only",
      anchor: {
        filePath: FILES[0]!.path,
        side: "head",
        startLine: 1,
        endLine: 1,
        status: "current",
      },
    } as unknown as ReviewThread;
    threads = [thread];
    useEntityStore.setState({ reviewThreads: { thread } });
    query.mockReturnValue(
      patchFor("snapshot-1", Array.from({ length: 1000 }, (_, i) => `line${i + 1}`).join("\n+")),
    );
    render("snapshot-1");
    await settle();
    act(() =>
      renderer!.root
        .findByType("input")
        .props.onChange({ target: { value: "Draft review reply" } }),
    );
    act(() => scrollNode.scrollTo({ top: 10000 }));
    await settle();
    expect(renderer!.root.findAllByType("input")).toHaveLength(0);
    act(() => scrollNode.scrollTo({ top: 0 }));
    await settle();
    expect(renderer!.root.findByType("input").props.value).toBe("Draft review reply");
  });
});
