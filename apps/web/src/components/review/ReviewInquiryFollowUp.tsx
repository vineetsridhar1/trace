import { useState } from "react";
import { gql } from "@urql/core";
import { useEntityField } from "@trace/client-core";
import { toast } from "sonner";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button";
import { mutateReview } from "./review-operations";

const ENQUEUE_FOLLOW_UP = gql`
  mutation EnqueueReviewFollowUp($input: EnqueueReviewInquiryInput!) {
    enqueueReviewInquiry(input: $input) {
      id
    }
  }
`;

export function ReviewInquiryFollowUp({
  inquiryId,
  onSent,
}: {
  inquiryId: string;
  onSent?(): void;
}) {
  const reviewId = useEntityField("reviewInquiries", inquiryId, "reviewId") ?? "";
  const snapshotId = useEntityField("reviewInquiries", inquiryId, "snapshotId") ?? "";
  const sourceKind = useEntityField("reviewInquiries", inquiryId, "sourceKind");
  const anchor = useEntityField("reviewInquiries", inquiryId, "anchor");
  const context = useEntityField("reviewInquiries", inquiryId, "context");
  const question = useEntityField("reviewInquiries", inquiryId, "question") ?? "";
  const answer = useEntityField("reviewInquiries", inquiryId, "responseMessage")?.text?.trim();
  const [followUp, setFollowUp] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const sendFollowUp = async () => {
    const followUpQuestion = followUp.trim();
    if (!followUpQuestion || !snapshotId || !sourceKind || sendingFollowUp) return;
    setSendingFollowUp(true);
    try {
      await mutateReview(ENQUEUE_FOLLOW_UP, {
        input: {
          reviewId,
          snapshotId,
          sourceKind,
          question: followUpQuestion,
          anchor,
          context: {
            ...(typeof context === "object" && !Array.isArray(context) ? context : {}),
            followUpToInquiryId: inquiryId,
            priorQuestion: question,
            priorAnswer: answer ?? null,
          },
        },
      });
      setFollowUp("");
      onSent?.();
      toast.success("Follow-up added to Review Chat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send follow-up");
    } finally {
      setSendingFollowUp(false);
    }
  };

  return (
    <div className="mt-2 flex items-end gap-2 rounded-lg border border-[var(--th-review-edge-strong)] bg-[var(--th-surface-deep)] p-2 focus-within:border-[var(--th-review-comment)]/50">
      <textarea
        value={followUp}
        onChange={(event) => setFollowUp(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendFollowUp();
          }
        }}
        disabled={sendingFollowUp}
        rows={1}
        className="field-sizing-content max-h-32 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] text-[var(--th-review-text)] outline-none placeholder:text-muted-foreground disabled:cursor-wait disabled:opacity-50"
        placeholder="Ask a follow-up"
        aria-label="Ask a follow-up"
      />
      <Button
        size="icon"
        aria-label="Send follow-up"
        disabled={!followUp.trim() || sendingFollowUp}
        onClick={() => void sendFollowUp()}
        className="bg-[var(--th-review-comment)] text-[var(--th-review-card)] hover:bg-[var(--th-review-accent-tint)]"
      >
        {sendingFollowUp ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
      </Button>
    </div>
  );
}
