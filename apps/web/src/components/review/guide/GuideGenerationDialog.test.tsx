import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import type { ReviewInquiry } from "@trace/gql";
import { useReviewUiStore } from "../../../stores/review-ui";
import { GuideGenerationDialog } from "./GuideGenerationDialog";
import { Textarea } from "../../ui/textarea";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("../review-operations", () => ({ mutateReview: mutate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../ui/dialog", () => {
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Part,
    DialogContent: Part,
    DialogHeader: Part,
    DialogTitle: Part,
    DialogDescription: Part,
    DialogFooter: Part,
  };
});

describe("Guide generation instructions", () => {
  let renderer: ReactTestRenderer;
  const onOpenChange = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useReviewUiStore.setState({ byReviewId: {} });
    useEntityStore.setState({
      reviewInquiries: {
        previous: {
          id: "previous",
          reviewId: "review",
          snapshotId: "old",
          sessionId: "session",
          createdAt: "2026-10-01T10:00:00Z",
          state: "completed",
          sourceKind: "guide_generation",
          position: 1,
          question: "Generate Guide",
          context: { guideInstructions: "Ignore frontend" },
        } satisfies ReviewInquiry,
      },
    });
    mutate.mockReset().mockResolvedValue({});
    onOpenChange.mockReset();
    act(() => {
      renderer = create(
        <GuideGenerationDialog
          open
          onOpenChange={onOpenChange}
          reviewId="review"
          snapshotId="latest"
          previousInquiryId="previous"
          generating={false}
          regenerating
        />,
      );
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
    vi.unstubAllGlobals();
  });
  const submit = () =>
    renderer.root
      .findAllByType("button")
      .find((node) => node.children.includes("Regenerate Guide"))!;
  const type = (value: string) =>
    act(() => renderer.root.findByType(Textarea).props.onChange({ target: { value } }));

  it("prefills saved preferences and queues edited instructions on the latest snapshot", async () => {
    expect(renderer.root.findByType(Textarea).props.value).toBe("Ignore frontend");
    expect(mutate).not.toHaveBeenCalled();
    type("  Explain syncing in depth only  ");
    await act(async () => submit().props.onClick());
    expect(mutate).toHaveBeenCalledWith(expect.anything(), {
      input: expect.objectContaining({
        reviewId: "review",
        snapshotId: "latest",
        sourceKind: "guide_generation",
        context: { guideInstructions: "Explain syncing in depth only" },
      }),
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("allows clearing old preferences for a general Guide", async () => {
    type("");
    await act(async () => submit().props.onClick());
    expect(mutate.mock.calls[0]![1].input.context).toEqual({ guideInstructions: "" });
  });

  it("preserves instructions and leaves the dialog open on failure", async () => {
    mutate.mockRejectedValue(new Error("Offline"));
    type("Only syncing");
    await act(async () => submit().props.onClick());
    expect(renderer.root.findByType(Textarea).props.value).toBe("Only syncing");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not queue on cancel", () => {
    act(() =>
      renderer.root
        .findAllByType("button")
        .find((node) => node.children.includes("Cancel"))!
        .props.onClick(),
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it("prevents overlapping submissions", async () => {
    let finish!: () => void;
    mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const click = submit().props.onClick;
    act(() => {
      click();
      click();
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});
