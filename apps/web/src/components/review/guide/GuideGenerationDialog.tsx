import { useId, useRef, useState } from "react";
import { useEntityField } from "@trace/client-core";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { useReviewUiStore } from "../../../stores/review-ui";
import { mutateReview } from "../review-operations";

const GENERATE = gql`
  mutation GenerateReviewGuide($input: EnqueueReviewInquiryInput!) {
    enqueueReviewInquiry(input: $input) {
      id
    }
  }
`;

export function GuideGenerationDialog({
  open,
  onOpenChange,
  reviewId,
  snapshotId,
  previousInquiryId,
  generating,
  regenerating,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  reviewId: string;
  snapshotId: string;
  previousInquiryId: string;
  generating: boolean;
  regenerating: boolean;
}) {
  const fieldId = useId();
  const draft = useReviewUiStore((state) => state.byReviewId[reviewId]?.guideInstructions);
  const patchUi = useReviewUiStore((state) => state.patch);
  const previousContext = useEntityField("reviewInquiries", previousInquiryId, "context");
  const savedInstructions =
    previousContext && typeof previousContext === "object" && !Array.isArray(previousContext)
      ? previousContext.guideInstructions
      : undefined;
  const instructions = draft ?? (typeof savedInstructions === "string" ? savedInstructions : "");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const submit = async () => {
    if (inFlight.current || generating) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await mutateReview(GENERATE, {
        input: {
          reviewId,
          snapshotId,
          sourceKind: "guide_generation",
          question: "Generate an explanation-first Guide for this immutable review snapshot.",
          context: { guideInstructions: instructions.trim() },
        },
      });
      onOpenChange(false);
      toast.success("Guide generation queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue Guide generation");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!inFlight.current) onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{regenerating ? "Regenerate Guide" : "Generate Guide"}</DialogTitle>
          <DialogDescription>
            Choose what this walkthrough should focus on. Leave instructions blank for an overview
            of the PR.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={fieldId} className="text-sm font-medium">
            Instructions (optional)
          </label>
          <Textarea
            id={fieldId}
            value={instructions}
            onChange={(event) => patchUi(reviewId, { guideInstructions: event.target.value })}
            placeholder={
              'For example: "Ignore frontend" or "Explain the syncing logic in depth only".'
            }
            className="min-h-28"
            maxLength={10000}
            disabled={submitting}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting || generating} onClick={() => void submit()}>
            {submitting
              ? "Queueing…"
              : generating
                ? "Generation already queued"
                : regenerating
                  ? "Regenerate Guide"
                  : "Generate Guide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
