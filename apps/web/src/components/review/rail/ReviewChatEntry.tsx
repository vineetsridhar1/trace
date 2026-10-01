import { gql } from "@urql/core";
import type { ReviewAnchor, ReviewInquiry } from "@trace/gql";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { mutateReview } from "../review-operations";
import { inquiryPresentation, inquirySourceLabel } from "../review-states";
import { ReviewAnswerText } from "./ReviewAnswerText";

const CANCEL = gql`
  mutation CancelReviewInquiry($inquiryId: ID!) {
    cancelReviewInquiry(inquiryId: $inquiryId) {
      id
      state
    }
  }
`;

function anchorOf(inquiry: ReviewInquiry): ReviewAnchor | null {
  const anchor = inquiry.anchor as ReviewAnchor | null;
  return anchor && typeof anchor.filePath === "string" ? anchor : null;
}

export function ReviewChatEntry({
  inquiry,
  isNext,
  onOpenReference,
  onTurnIntoComment,
}: {
  inquiry: ReviewInquiry;
  isNext: boolean;
  onOpenReference(filePath: string, startLine: number): void;
  onTurnIntoComment(inquiry: ReviewInquiry): void;
}) {
  const anchor = anchorOf(inquiry);
  const state = inquiryPresentation(inquiry.state, isNext);
  const answer = inquiry.responseMessage?.text?.trim();
  const quoted =
    typeof (inquiry.context as Record<string, unknown> | null)?.selectedText === "string"
      ? ((inquiry.context as Record<string, string>).selectedText ?? "").trim()
      : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <span className="rounded-[5px] border border-[#2e2e33] bg-[#1c1c1f] px-[7px] py-0.5 font-mono text-[10.5px] text-[#a1a1aa]">
          {inquirySourceLabel(inquiry.sourceKind, anchor)}
        </span>
        <span className={cn("ml-auto flex items-center gap-1.5", state.text)}>
          <span
            className={cn(
              "size-1.5 rounded-full",
              state.dot,
              inquiry.state === "running" && "shadow-[0_0_0_3px_rgba(96,165,250,.2)]",
            )}
          />
          {state.label}
        </span>
      </div>
      {quoted ? (
        <pre className="max-h-24 overflow-hidden rounded-md border border-[#232326] bg-[#0f0f10] px-2 py-1.5 font-mono text-[11px] leading-[17px] text-[#a1a1aa]">
          {quoted.split("\n").map((text, index) => (
            <div key={index}>
              <span className="select-none text-[#5c5c66]">
                {anchor ? anchor.startLine + index : ""}{" "}
              </span>
              {text}
            </div>
          ))}
        </pre>
      ) : null}
      <p className="m-0 text-[13px] font-medium leading-[1.5] text-[#ededef]">{inquiry.question}</p>
      {inquiry.state === "running" ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-[88%] animate-pulse rounded bg-gradient-to-r from-[#1f1f23] via-[#2e2e33] to-[#1f1f23]" />
          <div className="h-2 w-[64%] animate-pulse rounded bg-gradient-to-r from-[#1f1f23] via-[#2e2e33] to-[#1f1f23]" />
        </div>
      ) : null}
      {answer ? <ReviewAnswerText text={answer} onOpenReference={onOpenReference} /> : null}
      {inquiry.error ? <p className="m-0 text-[11.5px] text-[#fca5a5]">{inquiry.error}</p> : null}
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium">
        {answer ? (
          <>
            <button
              type="button"
              onClick={() => onTurnIntoComment(inquiry)}
              className="rounded-md border border-[#262626] px-2.5 py-1 text-[#d4d4d8] hover:bg-white/5"
            >
              Turn into comment
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(answer)}
              className="rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground"
            >
              Copy
            </button>
          </>
        ) : null}
        {inquiry.state === "queued" || inquiry.state === "running" ? (
          <button
            type="button"
            onClick={() =>
              void mutateReview(CANCEL, { inquiryId: inquiry.id }).catch((error) =>
                toast.error(error instanceof Error ? error.message : "Cancel failed"),
              )
            }
            className="ml-auto text-[#d4d4d8] hover:text-foreground"
          >
            {inquiry.state === "running" ? "Cancel" : "Remove from queue"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
