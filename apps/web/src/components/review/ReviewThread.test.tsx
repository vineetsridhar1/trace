import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import type { ReviewThread as Thread } from "@trace/gql";
import { toast } from "sonner";
import { useReviewUiStore } from "../../stores/review-ui";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("./review-operations", () => ({ mutateReview: mutate }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { ReviewThread } from "./ReviewThread";

const thread = {
  id: "thread",
  reviewId: "review",
  scope: "line",
  deliveryStatus: "trace_only",
  author: { id: "user", name: "Vineet" },
  comments: [
    { id: "deleted", body: "Deleted comment", deletedAt: "now", author: { name: "Vineet" } },
    { id: "first", body: "Please explain the retry.", author: { name: "Vineet" } },
    { id: "reply", body: "It handles transient errors.", author: { name: "Colleague" } },
  ],
} as unknown as Thread;

describe("comment conversation actions", () => {
  let renderer: ReactTestRenderer;
  const storage = { getItem: vi.fn(), setItem: vi.fn() };
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("localStorage", storage);
    storage.setItem.mockClear();
    mutate.mockReset().mockResolvedValue({});
    useReviewUiStore.setState({ byReviewId: {}, deletedThreadIds: [], replyDrafts: {} });
    useEntityStore.setState({ reviewThreads: { thread } });
    act(() => {
      renderer = create(<ReviewThread threadId="thread" />);
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

  it("resolves into a summary, shows the conversation, and reopens it", async () => {
    expect(JSON.stringify(renderer.toJSON())).toContain("It handles transient errors.");
    await act(async () => button("Resolve").props.onClick());
    expect(mutate).toHaveBeenCalledWith(expect.anything(), { threadId: "thread", resolved: true });
    expect(renderer.root.findAllByType("article")).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain("Please explain the retry.");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Deleted comment");
    act(() =>
      useEntityStore.getState().upsert("reviewThreads", "thread", { ...thread, resolvedAt: "now" }),
    );
    act(() => button("Show").props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain("It handles transient errors.");
    await act(async () => button("Reopen").props.onClick());
    expect(mutate).toHaveBeenLastCalledWith(expect.anything(), {
      threadId: "thread",
      resolved: false,
    });
    expect(renderer.root.findAllByType("article")).toHaveLength(1);
  });

  it("starts resolved comments collapsed and preserves Show across remounts", () => {
    act(() =>
      useEntityStore.getState().upsert("reviewThreads", "thread", { ...thread, resolvedAt: "now" }),
    );
    expect(renderer.root.findAllByType("article")).toHaveLength(0);
    act(() => button("Show").props.onClick());
    act(() => {
      renderer.unmount();
      renderer = create(<ReviewThread threadId="thread" />);
    });
    expect(renderer.root.findAllByType("article")).toHaveLength(1);
  });

  it.each([false, true])(
    "locally deletes an expanded or collapsed thread (resolved: %s)",
    (resolved) => {
      if (resolved)
        act(() =>
          useEntityStore
            .getState()
            .upsert("reviewThreads", "thread", { ...thread, resolvedAt: "now" }),
        );
      act(() => {
        if (resolved)
          renderer.root.findByProps({ "aria-label": "Delete comment thread" }).props.onClick();
        else button("Delete").props.onClick();
      });
      expect(renderer.toJSON()).toBeNull();
      expect(useEntityStore.getState().reviewThreads.thread?.comments).toEqual(thread.comments);
      expect(mutate).not.toHaveBeenCalled();
      expect(storage.setItem).toHaveBeenCalledWith("trace.review.deleted-threads.v1", '["thread"]');
      act(() => {
        renderer.unmount();
        renderer = create(<ReviewThread threadId="thread" />);
      });
      expect(renderer.toJSON()).toBeNull();
    },
  );

  it("leaves comments expanded when resolving fails", async () => {
    mutate.mockRejectedValue(new Error("unavailable"));
    await act(async () => button("Resolve").props.onClick());
    expect(renderer.root.findAllByType("article")).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith("unavailable");
  });
});
