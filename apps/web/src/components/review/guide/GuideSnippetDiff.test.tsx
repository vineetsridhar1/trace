import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import type { ReviewThread as Thread, ReviewInquiry } from "@trace/gql";
import { GuideSnippetDiff } from "./GuideSnippetDiff";
import { DiffLineRow } from "../diff/DiffLineRow";
import { DiffSelectionPopover } from "../diff/DiffSelectionPopover";
import { useReviewUiStore } from "../../../stores/review-ui";
import { ReviewInquiryCard } from "../ReviewInquiryCard";
import { ReviewThread } from "../ReviewThread";
vi.mock("../../../lib/urql", () => ({ client: {} }));
const comment = vi.fn(),
  ask = vi.fn();
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("Element", class {});
  useReviewUiStore.setState({ byReviewId: {}, deletedInquiryIds: [] });
  useEntityStore.setState({ reviewThreads: {}, reviewInquiries: {} });
  comment.mockReset();
  ask.mockReset();
  act(() => {
    renderer = create(
      <GuideSnippetDiff
        reviewId="review"
        snapshotId="snapshot"
        filePath="src/a.ts"
        lines={[10, 11, 12].map((number) => ({
          kind: "context",
          text: `code${number}`,
          oldLine: null,
          newLine: number,
        }))}
        onComment={comment}
        onAsk={ask}
      />,
      {
        createNodeMock: (element) =>
          element.type === "button" ||
          (typeof element.props === "object" &&
            element.props !== null &&
            "data-slot" in element.props)
            ? null
            : { getBoundingClientRect: () => ({ top: 100 }) },
      },
    );
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});
it.each(["onComment", "onAsk"])(
  "selects a range and invokes %s with immutable code context",
  (action) => {
    act(() =>
      renderer.root.findAllByType(DiffLineRow)[0]!.props.onPointerDown({
        button: 0,
        currentTarget: { getBoundingClientRect: () => ({ top: 120 }) },
      }),
    );
    act(() => renderer.root.findAllByType(DiffLineRow)[2]!.props.onPointerEnter());
    act(() => renderer.root.findByType(DiffSelectionPopover).props[action]());
    expect(action === "onComment" ? comment : ask).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "src/a.ts",
        side: "head",
        startLine: 10,
        endLine: 12,
        selectedText: "code10\ncode11\ncode12",
      }),
    );
    expect(renderer.root.findAllByType(DiffSelectionPopover)).toHaveLength(0);
  },
);
it("dismisses the selection on an outside click", () => {
  act(() =>
    renderer.root.findAllByType(DiffLineRow)[0]!.props.onPointerDown({
      button: 0,
      currentTarget: { getBoundingClientRect: () => ({ top: 120 }) },
    }),
  );
  act(() => {
    document.dispatchEvent(new Event("pointerdown"));
  });
  expect(renderer.root.findAllByType(DiffSelectionPopover)).toHaveLength(0);
});
it("renders event-driven comments and AI state updates only at the matching snapshot and line", () => {
  const anchor = {
    snapshotId: "snapshot",
    filePath: "src/a.ts",
    side: "head",
    startLine: 10,
    endLine: 11,
    status: "current",
  };
  const thread = {
    id: "thread",
    reviewId: "review",
    scope: "line",
    anchor,
    comments: [],
  } as unknown as Thread;
  const inquiry = {
    id: "question",
    reviewId: "review",
    snapshotId: "snapshot",
    sourceKind: "diff_anchor",
    anchor,
    state: "queued",
    position: 2,
    question: "Why?",
    context: null,
    createdAt: "2026-10-01",
    sessionId: "session",
  } as ReviewInquiry;
  act(() =>
    useEntityStore.setState({
      reviewThreads: { thread },
      reviewInquiries: { question: inquiry, old: { ...inquiry, id: "old", snapshotId: "earlier" } },
    }),
  );
  expect(renderer.root.findAllByType(ReviewThread)).toHaveLength(1);
  expect(renderer.root.findAllByType(ReviewInquiryCard)).toHaveLength(1);
  act(() =>
    useEntityStore.setState({ reviewInquiries: { question: { ...inquiry, state: "running" } } }),
  );
  expect(JSON.stringify(renderer.toJSON())).toContain("Thinking…");
  act(() => useReviewUiStore.getState().deleteInquiry("question"));
  expect(renderer.root.findAllByType(ReviewInquiryCard)).toHaveLength(0);
  expect(renderer.root.findAllByType(ReviewThread)).toHaveLength(1);
  expect(useEntityStore.getState().reviewInquiries.question?.state).toBe("running");
});
