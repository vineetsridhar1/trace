import { gql } from "@urql/core";
import type { ReviewThread } from "@trace/gql";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { mutateReview } from "../review-operations";
import { anchorPresentation, deliveryBorderClass, deliveryPresentation } from "../review-states";

const SELECT = gql`
  mutation SelectReviewThread($threadId: ID!, $selected: Boolean!) {
    setReviewThreadSelected(threadId: $threadId, selected: $selected) {
      id
    }
  }
`;

export function ReviewOutboxThread({
  thread,
  onOpen,
}: {
  thread: ReviewThread;
  onOpen(thread: ReviewThread): void;
}) {
  const delivery = deliveryPresentation(thread.deliveryStatus);
  const anchor = thread.anchor ? anchorPresentation(thread.anchor) : null;
  const selected = thread.deliveryStatus === "selected";
  const delivered = thread.deliveryStatus === "delivered";
  const body = thread.comments.find((comment) => !comment.deletedAt)?.body ?? "";
  const replies = thread.comments.filter((comment) => !comment.deletedAt).length - 1;

  return (
    <div
      className={cn(
        "flex flex-col gap-[7px] rounded-[9px] border p-3",
        deliveryBorderClass(thread.deliveryStatus),
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium">
        {delivered ? (
          <span className="flex items-center gap-1 text-[#6ee7b7]">
            <Check size={10} /> Delivered
          </span>
        ) : (
          <button
            type="button"
            onClick={() =>
              void mutateReview(SELECT, { threadId: thread.id, selected: !selected }).catch(
                (error) => toast.error(error instanceof Error ? error.message : "Selection failed"),
              )
            }
            className="flex items-center gap-2"
            aria-pressed={selected}
          >
            <span
              className={cn(
                "flex size-3.5 items-center justify-center rounded",
                selected ? "bg-[#3b82f6] text-white" : "border border-[#52525b]",
              )}
            >
              {selected ? <Check size={9} /> : null}
            </span>
            <span className={delivery.text}>{delivery.label}</span>
          </button>
        )}
        {delivered && thread.providerCommentId ? (
          <span className="flex items-center gap-1 text-[#93c5fd]">
            View on GitHub <ExternalLink size={9} />
          </span>
        ) : null}
        {anchor ? (
          <span className={cn("ml-auto flex items-center gap-1.5", anchor.text)}>
            <span className={cn("size-[5px] rounded-full", anchor.dot)} />
            {anchor.label}
          </span>
        ) : (
          <span className="ml-auto text-muted-foreground">{thread.scope.replace("_", " ")}</span>
        )}
      </div>
      <button type="button" onClick={() => onOpen(thread)} className="text-left">
        <p className="m-0 line-clamp-3 text-[12.5px] leading-[1.5] text-[#d4d4d8]">{body}</p>
      </button>
      <span className="text-[11px] text-muted-foreground">
        {thread.author.name}
        {replies > 0 ? ` · ${replies} ${replies === 1 ? "reply" : "replies"}` : ""}
        {thread.resolvedAt ? " · resolved" : ""}
      </span>
      {thread.anchor?.status === "outdated" ? (
        <span className="text-[11px] font-medium text-[#fbbf24]">
          Re-anchor to include it in a GitHub review
        </span>
      ) : null}
      {thread.deliveryError ? (
        <span className="text-[11px] text-[#fca5a5]">{thread.deliveryError}</span>
      ) : null}
    </div>
  );
}
