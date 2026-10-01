import { useState } from "react";
import { gql } from "@urql/core";
import type { ReviewThread as ReviewThreadType } from "@trace/gql";
import { Check, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { mutateReview } from "./review-operations";
import { anchorPresentation, deliveryPresentation } from "./review-states";
import { ReviewThreadBody } from "./ReviewThreadBody";

const REPLY = gql`
  mutation ReplyToReviewThread($threadId: ID!, $body: String!) {
    replyToReviewThread(threadId: $threadId, body: $body) {
      id
    }
  }
`;
const RESOLVE = gql`
  mutation ResolveReviewThread($threadId: ID!, $resolved: Boolean!) {
    resolveReviewThread(threadId: $threadId, resolved: $resolved) {
      id
    }
  }
`;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ReviewThread({
  thread,
  onAsk,
}: {
  thread: ReviewThreadType;
  onAsk?(thread: ReviewThreadType): void;
}) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const anchor = thread.anchor ? anchorPresentation(thread.anchor) : null;
  const delivery = deliveryPresentation(thread.deliveryStatus);
  const first = thread.comments.find((comment) => !comment.deletedAt);

  const submitReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await mutateReview(REPLY, { threadId: thread.id, body: reply.trim() });
      setReply("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <article className="max-w-[720px] overflow-hidden rounded-[9px] border border-[#2e2e33] bg-[#1c1c1f]">
      <div className="flex gap-2.5 p-3.5">
        <span className="size-6 shrink-0 rounded-full bg-[#2a4a7a] text-center text-[10px] font-semibold leading-6 text-[#cfe0ff]">
          {initials(thread.author.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="text-[#ededef]">{thread.author.name}</span>
            {anchor ? (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] bg-white/[0.04] px-[7px] py-px text-[10.5px]",
                  anchor.text,
                )}
              >
                <span className={cn("size-[5px] rounded-full", anchor.dot)} />
                {anchor.label}
              </span>
            ) : (
              <span className="text-[10.5px] text-muted-foreground">
                {thread.scope.replace("_", " ")}
              </span>
            )}
            <span
              className={cn(
                "ml-auto flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px]",
                thread.deliveryStatus === "selected" || thread.deliveryStatus === "delivered"
                  ? "bg-[#3b82f6]/[0.14]"
                  : "bg-white/[0.04]",
                delivery.text,
              )}
            >
              {thread.deliveryStatus === "delivered" ? <Check size={10} /> : null}
              {delivery.label}
            </span>
          </div>
          {first ? <ReviewThreadBody body={first.body} /> : null}
          {thread.comments.filter((comment) => !comment.deletedAt && comment !== first).length >
          0 ? (
            <div className="mt-1 flex flex-col gap-2 border-l border-[#2e2e33] pl-3">
              {thread.comments
                .filter((comment) => !comment.deletedAt && comment !== first)
                .map((comment) => (
                  <div key={comment.id}>
                    <span className="mr-2 text-[10.5px] font-medium text-muted-foreground">
                      {comment.author.name}
                    </span>
                    <ReviewThreadBody body={comment.body} />
                  </div>
                ))}
            </div>
          ) : null}
          {thread.deliveryError ? (
            <p className="text-[11px] text-[#fca5a5]">{thread.deliveryError}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-[#262626] py-2.5 pl-12 pr-3.5 text-xs font-medium">
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitReply();
            }
          }}
          placeholder="Reply…"
          className="h-7 min-w-0 flex-1 rounded-md border border-[#262626] bg-[#111] px-2.5 font-normal outline-none placeholder:text-[#5c5c66] focus:border-[#3b82f6]"
        />
        {reply.trim() ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={sending}
            onClick={() => void submitReply()}
          >
            <Send size={11} />
          </Button>
        ) : null}
        {onAsk ? (
          <button
            type="button"
            onClick={() => onAsk(thread)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-[#a78bfa]/30 px-2.5 text-[#c4b5fd] hover:bg-[#a78bfa]/10"
          >
            <Sparkles size={11} /> Ask session
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            void mutateReview(RESOLVE, {
              threadId: thread.id,
              resolved: !thread.resolvedAt,
            }).catch((error) =>
              toast.error(error instanceof Error ? error.message : "Update failed"),
            )
          }
          className="flex h-7 items-center rounded-md border border-[#262626] px-2.5 text-[#d4d4d8] hover:bg-white/5"
        >
          {thread.resolvedAt ? "Unresolve" : "Resolve"}
        </button>
      </div>
    </article>
  );
}
