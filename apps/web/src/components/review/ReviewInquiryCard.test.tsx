import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import type { ReviewInquiry } from "@trace/gql";
import { toast } from "sonner";
import { useReviewUiStore } from "../../stores/review-ui";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("./review-operations", () => ({ mutateReview: mutate }));
vi.mock("./ReviewThreadBody", () => ({
  ReviewThreadBody: ({ body }: { body: string }) => <p>{body}</p>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ReviewInquiryCard } from "./ReviewInquiryCard";
import { GuideChapterInquiries } from "./guide/GuideChapterInquiries";

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
    vi.mocked(toast.error).mockClear();
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
      .find(
        (node) =>
          (label === "Delete" && node.props["aria-label"] === "Delete AI conversation") ||
          node.children.some((child) => typeof child === "string" && child.trim() === label),
      )!;
  const answerVisible = () =>
    JSON.stringify(renderer.toJSON()).includes("Because access is checked first.");

  function addFollowUps(state: ReviewInquiry["state"] = "completed") {
    const followUp = {
      ...inquiry,
      id: "follow-up",
      position: 2,
      question: "What if it fails?",
      context: { followUpToInquiryId: inquiry.id },
      responseMessage: { ...inquiry.responseMessage!, text: "It throws." },
    };
    const next = {
      ...followUp,
      id: "next",
      position: 3,
      state,
      question: "Who catches it?",
      context: { followUpToInquiryId: followUp.id },
      responseMessage: { ...inquiry.responseMessage!, text: "The caller catches it." },
    };
    act(() => useEntityStore.getState().upsertMany("reviewInquiries", [followUp, next]));
  }

  it("keeps nested follow-ups in one container and continues from the latest answer", async () => {
    addFollowUps();
    expect(renderer.root.findAllByType("article")).toHaveLength(1);
    expect(renderer.root.findAllByType("textarea")).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("What if it fails?");
    expect(JSON.stringify(renderer.toJSON())).toContain("Who catches it?");
    expect(JSON.stringify(renderer.toJSON())).toContain("The caller catches it.");
    act(() => renderer.root.findByType("textarea").props.onChange({ target: { value: "How?" } }));
    await act(async () =>
      renderer.root.findByType("textarea").props.onKeyDown({
        key: "Enter",
        shiftKey: false,
        preventDefault: vi.fn(),
      }),
    );
    expect(mutate).toHaveBeenCalledWith(expect.anything(), {
      input: expect.objectContaining({
        context: {
          followUpToInquiryId: "next",
          priorQuestion: "Who catches it?",
          priorAnswer: "The caller catches it.",
        },
      }),
    });
  });

  it("resolves and reopens the whole conversation with one control", async () => {
    addFollowUps();
    await act(async () => button("Resolve").props.onClick());
    expect(mutate.mock.calls.map((call) => call[1])).toEqual([
      { inquiryId: "question", resolved: true },
      { inquiryId: "follow-up", resolved: true },
      { inquiryId: "next", resolved: true },
    ]);
    expect(renderer.root.findAllByType("article")).toHaveLength(0);
    act(() => {
      for (const question of Object.values(useEntityStore.getState().reviewInquiries))
        useEntityStore
          .getState()
          .upsert("reviewInquiries", question.id, { ...question, resolvedAt: "now" });
      button("Show").props.onClick();
    });
    expect(renderer.root.findAllByType("article")).toHaveLength(1);
    await act(async () => button("Reopen").props.onClick());
    expect(mutate.mock.calls.slice(-3).map((call) => call[1])).toEqual([
      { inquiryId: "question", resolved: false },
      { inquiryId: "follow-up", resolved: false },
      { inquiryId: "next", resolved: false },
    ]);
  });

  it("keeps running follow-ups visible and waits for their completion before resolving", () => {
    addFollowUps("running");
    expect(JSON.stringify(renderer.toJSON())).toContain("Thinking…");
    expect(renderer.root.findAllByType("textarea")).toHaveLength(0);
    expect(button("Resolve")).toBeUndefined();
    act(() =>
      useEntityStore.getState().upsert("reviewInquiries", "next", {
        ...useEntityStore.getState().reviewInquiries.next!,
        state: "completed",
      }),
    );
    expect(renderer.root.findAllByType("textarea")).toHaveLength(1);
    expect(button("Resolve")).toBeDefined();
  });

  it("groups older thread follow-ups in their Guide container and deletes the whole conversation", () => {
    const root = {
      ...inquiry,
      sourceKind: "guide_anchor" as const,
      context: { guideId: "guide", guideChapterId: "chapter" },
    };
    act(() => {
      useEntityStore.getState().upsert("reviewInquiries", root.id, root);
      useEntityStore.getState().upsert("reviewInquiries", "follow-up", {
        ...root,
        id: "follow-up",
        sourceKind: "thread",
        position: 2,
        question: "Follow-up in Guide",
        context: { ...root.context, followUpToInquiryId: root.id },
      });
      renderer.update(
        <GuideChapterInquiries
          reviewId="review"
          guideId="guide"
          snapshotId="snapshot"
          chapterId="chapter"
        />,
      );
    });
    expect(renderer.root.findAllByType("article")).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("Follow-up in Guide");
    act(() => button("Delete").props.onClick());
    expect(renderer.toJSON()).toBeNull();
    expect(useEntityStore.getState().reviewInquiries["follow-up"]).toBeDefined();
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each(["diff_anchor", "guide_anchor", "thread"] as const)(
    "keeps a %s follow-up at its original location with the previous answer",
    async (sourceKind) => {
      const anchor = { filePath: "src/access.ts", side: "head", startLine: 1, endLine: 2 };
      const context = {
        guideId: "guide",
        guideChapterId: "chapter",
        selectedText: "checkAccess()",
      };
      act(() => {
        useEntityStore.setState({
          reviewInquiries: { question: { ...inquiry, sourceKind, anchor, context } },
        });
        renderer.root
          .findByType("textarea")
          .props.onChange({ target: { value: " What if access fails? " } });
      });
      await act(async () => {
        renderer.root.findByType("textarea").props.onKeyDown({
          key: "Enter",
          shiftKey: false,
          preventDefault: vi.fn(),
        });
      });
      expect(mutate).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
        input: {
          reviewId: "review",
          snapshotId: "snapshot",
          sourceKind,
          question: "What if access fails?",
          anchor,
          context: {
            ...context,
            followUpToInquiryId: "question",
            priorQuestion: inquiry.question,
            priorAnswer: inquiry.responseMessage?.text,
          },
        },
      });
      expect(renderer.root.findByType("textarea").props.value).toBe("");
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it("preserves the follow-up draft when submission fails", async () => {
    mutate.mockRejectedValue(new Error("unavailable"));
    act(() => {
      renderer.root
        .findByType("textarea")
        .props.onChange({ target: { value: "What if access fails?" } });
    });
    await act(async () => {
      renderer.root.findByType("textarea").props.onKeyDown({
        key: "Enter",
        shiftKey: false,
        preventDefault: vi.fn(),
      });
    });
    expect(renderer.root.findByType("textarea").props.value).toBe("What if access fails?");
    expect(toast.error).toHaveBeenCalledWith("unavailable");
  });

  it("sends from the composer button and disables it for empty drafts", async () => {
    const send = () =>
      renderer.root.findByProps({ "aria-label": "Send follow-up", "data-slot": "button" });
    expect(send().props.disabled).toBe(true);
    act(() => renderer.root.findByType("textarea").props.onChange({ target: { value: "Why?" } }));
    expect(send().props.disabled).toBe(false);
    await act(async () => send().props.onClick());
    expect(mutate).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      input: expect.objectContaining({
        question: "Why?",
        context: expect.objectContaining({ followUpToInquiryId: "question" }),
      }),
    });
    expect(renderer.root.findByType("textarea").props.value).toBe("");
    expect(send().props.disabled).toBe(true);
  });

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
