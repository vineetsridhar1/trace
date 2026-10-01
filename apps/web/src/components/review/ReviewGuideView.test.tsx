import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import type { ReviewGuide, ReviewInquiry, SessionMessage } from "@trace/gql";
import { ReviewGuideView } from "./ReviewGuideView";
import { ReviewInlineComposer } from "./ReviewInlineComposer";
import { ReviewInquiryCard } from "./ReviewInquiryCard";
import { useReviewUiStore } from "../../stores/review-ui";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("./review-operations", () => ({ mutateReview: mutate }));
vi.mock("./guide/GuideCodeExcerpt", () => ({ GuideCodeExcerpt: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const guide: ReviewGuide = {
  id: "guide",
  reviewId: "review",
  snapshotId: "old-snapshot",
  generationInquiryId: "generation",
  status: "ready",
  title: "Game",
  intent: "Game flow",
  version: 1,
  createdAt: "2026-10-01",
  content: {
    chapters: [
      {
        id: "validate",
        title: "Validate input",
        explanation: "Before writing state",
        references: [],
      },
    ],
  },
};
const inquiry: ReviewInquiry = {
  id: "question",
  reviewId: "review",
  snapshotId: "old-snapshot",
  sessionId: "session",
  sourceKind: "guide_anchor",
  question: "Why validate first?",
  state: "queued",
  position: 2,
  context: { guideId: "guide", guideChapterId: "validate" },
  createdAt: "2026-10-01",
};

describe("Guide Ask about this", () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useEntityStore.setState({ reviewInquiries: {} });
    useReviewUiStore.setState({ byReviewId: {} });
    mutate.mockReset();
    mutate.mockResolvedValue({});
    act(() => {
      renderer = create(
        <ReviewGuideView
          reviewId="review"
          snapshotId="latest-snapshot"
          files={[]}
          guide={guide}
          generating={false}
          onOpenInChanges={vi.fn()}
          onReviewAllChanges={vi.fn()}
        />,
      );
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  function click(label: string) {
    const button = renderer.root
      .findAllByType("button")
      .find((node) =>
        node.children.some((child) => typeof child === "string" && child.includes(label)),
      );
    expect(button).toBeDefined();
    act(() => button!.props.onClick());
  }

  it("opens a composer and queues the user's question on the displayed Guide snapshot", async () => {
    click("Ask about this");
    expect(mutate).not.toHaveBeenCalled();
    expect(renderer.root.findByType("textarea").props.placeholder).toBe("Ask about this chapter…");
    act(() => renderer.root.findByType(ReviewInlineComposer).props.onBody("Why validate first?"));
    await act(async () => {
      renderer.root.findByType(ReviewInlineComposer).props.onSubmit();
    });
    expect(mutate).toHaveBeenCalledWith(expect.anything(), {
      input: {
        reviewId: "review",
        snapshotId: "old-snapshot",
        sourceKind: "guide_anchor",
        question: "Why validate first?",
        context: { guideId: "guide", guideChapterId: "validate" },
      },
    });
    expect(renderer.root.findAllByType(ReviewInlineComposer)).toHaveLength(0);
    // Mutation results never create UI entities. The review event populates the store.
    expect(renderer.root.findAllByType(ReviewInquiryCard)).toHaveLength(0);
  });

  it("keeps the draft when enqueue fails", async () => {
    mutate.mockRejectedValue(new Error("Queue unavailable"));
    click("Ask about this");
    act(() => renderer.root.findByType(ReviewInlineComposer).props.onBody("Why?"));
    await act(async () => {
      renderer.root.findByType(ReviewInlineComposer).props.onSubmit();
    });
    expect(renderer.root.findByType(ReviewInlineComposer).props.body).toBe("Why?");
  });

  it("renders live queue and answer updates on the chapter and supports hiding the answer", () => {
    act(() =>
      useEntityStore.setState({
        reviewInquiries: {
          question: inquiry,
          blocker: {
            ...inquiry,
            id: "blocker",
            position: 1,
            sourceKind: "guide_generation",
            state: "running",
          },
          other: { ...inquiry, id: "other", context: { guideChapterId: "other" } },
        },
      }),
    );
    expect(renderer.root.findAllByType(ReviewInquiryCard)).toHaveLength(1);
    expect(renderer.root.findByType(ReviewInquiryCard).props.blockerLabel).toBe("Guide generation");
    expect(JSON.stringify(renderer.toJSON())).toContain("Why validate first?");
    act(() =>
      useEntityStore.setState({ reviewInquiries: { question: { ...inquiry, state: "running" } } }),
    );
    expect(JSON.stringify(renderer.toJSON())).toContain("Thinking…");
    act(() =>
      useEntityStore.setState({
        reviewInquiries: {
          question: {
            ...inquiry,
            state: "completed",
            responseMessage: { text: "Validation protects shared state." } as SessionMessage,
          },
        },
      }),
    );
    expect(JSON.stringify(renderer.toJSON())).toContain("Validation protects shared state.");
    click("Hide");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Validation protects shared state.");
    click("Show");
    expect(JSON.stringify(renderer.toJSON())).toContain("Validation protects shared state.");
  });
});
