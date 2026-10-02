import { useState } from "react";
import { gql } from "@urql/core";
import { useEntityField } from "@trace/client-core";
import { toast } from "sonner";
import { mutateReview } from "./review-operations";

const ENQUEUE_FOLLOW_UP = gql`
  mutation EnqueueReviewFollowUp($input: EnqueueReviewInquiryInput!) {
    enqueueReviewInquiry(input: $input) {
      id
    }
  }
`;

export function ReviewInquiryFollowUp({ inquiryId }: { inquiryId: string }) {
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
      toast.success("Follow-up added to Review Chat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send follow-up");
    } finally {
      setSendingFollowUp(false);
    }
  };

  return (
    <div className="border-t border-[var(--th-review-ai)]/15 pt-2.5">
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
        className="h-12 w-full resize-none rounded-md border border-[var(--th-review-ai)]/20 bg-black/15 p-2 text-xs outline-none placeholder:text-muted-foreground focus:border-[var(--th-review-ai)] disabled:cursor-wait disabled:opacity-50"
        placeholder="Ask a follow-up…"
        aria-label="Ask a follow-up"
      />
    </div>
  );
}
