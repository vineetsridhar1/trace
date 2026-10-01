import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import type { ReviewInquiry } from "@trace/gql";
import { useReviewUiStore } from "../../stores/review-ui";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("./review-operations", () => ({ mutateReview: mutate }));
vi.mock("./ReviewThreadBody", () => ({
  ReviewThreadBody: ({ body }: { body: string }) => <p>{body}</p>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { ReviewInquiryCard } from "./ReviewInquiryCard";

describe("AI conversation actions", () => {
  let renderer: ReactTestRenderer;
  const storage = { getItem: vi.fn(), setItem: vi.fn() };
  const inquiry = {
    id: "question",
    reviewId: "review",
    snapshotId: "snapshot",
    sessionId: "session",
    state: "completed",
    sourceKind: "diff_anchor",
    position: 1,
    question: "Why is this safe?",
    createdAt: "2026-10-01T12:00:00Z",
    responseMessage: { text: "Because access is checked first." },
  } as ReviewInquiry;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("localStorage", storage);
    storage.setItem.mockClear();
    mutate.mockReset().mockResolvedValue({});
    useReviewUiStore.setState({ byReviewId: {}, deletedInquiryIds: [] });
    useEntityStore.setState({ reviewInquiries: { question: inquiry } });
    act(() => {
      renderer = create(
        <ReviewInquiryCard inquiryId="question" queuedAheadCount={0} blockerLabel={null} />,
      );
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
    vi.unstubAllGlobals();
  });

  const button = (label: string) =>
    renderer.root
      .findAllByType("button")
      .find((node) =>
        node.children.some((child) => typeof child === "string" && child.trim() === label),
      )!;
  const answerVisible = () =>
    JSON.stringify(renderer.toJSON()).includes("Because access is checked first.");

  it("resolves into a compact row, allows viewing it, and reopens it", async () => {
    expect(answerVisible()).toBe(true);
    await act(async () => {
      button("Resolve").props.onClick();
    });
    expect(mutate).toHaveBeenCalledWith(expect.anything(), {
      inquiryId: "question",
      resolved: true,
    });
    expect(answerVisible()).toBe(false);
    act(() => {
      useEntityStore.setState({ reviewInquiries: { question: { ...inquiry, resolvedAt: "now" } } });
    });
    act(() => {
      button("Show").props.onClick();
    });
    expect(answerVisible()).toBe(true);
    await act(async () => {
      button("Reopen").props.onClick();
    });
    expect(mutate).toHaveBeenLastCalledWith(expect.anything(), {
      inquiryId: "question",
      resolved: false,
    });
    expect(answerVisible()).toBe(true);
  });

  it("starts resolved conversations collapsed without hiding their question", () => {
    act(() => {
      useEntityStore.setState({ reviewInquiries: { question: { ...inquiry, resolvedAt: "now" } } });
    });
    expect(answerVisible()).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).toContain("Why is this safe?");
    expect(button("Show")).toBeDefined();
  });

  it("deletes from the frontend across remounts without changing the inquiry or queue", () => {
    act(() => {
      button("Delete").props.onClick();
    });
    expect(renderer.toJSON()).toBeNull();
    expect(useEntityStore.getState().reviewInquiries.question).toEqual(inquiry);
    expect(mutate).not.toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledWith(
      "trace.review.deleted-inquiries.v1",
      '["question"]',
    );
    act(() => {
      renderer.unmount();
      renderer = create(
        <ReviewInquiryCard inquiryId="question" queuedAheadCount={0} blockerLabel={null} />,
      );
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("can delete the compact resolved row", () => {
    act(() => {
      useEntityStore.setState({ reviewInquiries: { question: { ...inquiry, resolvedAt: "now" } } });
    });
    act(() => {
      renderer.root.findByProps({ "aria-label": "Delete AI conversation" }).props.onClick();
    });
    expect(renderer.toJSON()).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps the conversation expanded if resolving fails", async () => {
    mutate.mockRejectedValue(new Error("unavailable"));
    await act(async () => {
      button("Resolve").props.onClick();
    });
    expect(answerVisible()).toBe(true);
    expect(button("Resolve")).toBeDefined();
  });
});
