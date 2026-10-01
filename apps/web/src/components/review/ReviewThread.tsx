import { useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useEntityField } from "@trace/client-core";
import { Check, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { mutateReview } from "./review-operations";
import { anchorPresentation, deliveryPresentation } from "./review-states";
import { useReviewUiStore } from "../../stores/review-ui";
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
  threadId,
  onAsk,
}: {
  threadId: string;
  onAsk?(threadId: string): void;
}) {
  const reply = useReviewUiStore((state) => state.replyDrafts[threadId] ?? "");
  const setReplyDraft = useReviewUiStore((state) => state.setReplyDraft);
  const setReply = (body: string) => setReplyDraft(threadId, body);
  const [sending, setSending] = useState(false);
  const authorName = useEntityField("reviewThreads", threadId, "author")?.name ?? "";
  const scope = useEntityField("reviewThreads", threadId, "scope");
  const rawAnchor = useEntityField("reviewThreads", threadId, "anchor");
  const deliveryStatus = useEntityField("reviewThreads", threadId, "deliveryStatus");
  const deliveryError = useEntityField("reviewThreads", threadId, "deliveryError");
  const resolvedAt = useEntityField("reviewThreads", threadId, "resolvedAt");
  const comments = useEntityField("reviewThreads", threadId, "comments");
  const anchor = rawAnchor ? anchorPresentation(rawAnchor) : null;
  const delivery = deliveryPresentation(deliveryStatus ?? "trace_only");
  const visible = useMemo(
    () => (comments ?? []).filter((comment) => !comment.deletedAt),
    [comments],
  );
  const [first, ...replies] = visible;

  const submitReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await mutateReview(REPLY, { threadId, body: reply.trim() });
      setReply("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <article className="max-w-[720px] overflow-hidden rounded-[9px] border border-[var(--th-edge-strong)] bg-[var(--th-raised)]">
      <div className="flex gap-2.5 p-3.5">
        <span className="size-6 shrink-0 rounded-full bg-[var(--th-review-accent-edge)] text-center text-[10px] font-semibold leading-6 text-[var(--th-review-accent-tint)]">
          {initials(authorName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="text-[var(--th-review-text)]">{authorName}</span>
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
                {scope?.replace("_", " ")}
              </span>
            )}
            <span
              className={cn(
                "ml-auto flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px]",
                deliveryStatus === "selected" || deliveryStatus === "delivered"
                  ? "bg-[var(--th-accent)]/[0.14]"
                  : "bg-white/[0.04]",
                delivery.text,
              )}
            >
              {deliveryStatus === "delivered" ? <Check size={10} /> : null}
              {delivery.label}
            </span>
          </div>
          {first ? <ReviewThreadBody body={first.body} /> : null}
          {replies.length > 0 ? (
            <div className="mt-1 flex flex-col gap-2 border-l border-[var(--th-edge-strong)] pl-3">
              {replies.map((comment) => (
                <div key={comment.id}>
                  <span className="mr-2 text-[10.5px] font-medium text-muted-foreground">
                    {comment.author.name}
                  </span>
                  <ReviewThreadBody body={comment.body} />
                </div>
              ))}
            </div>
          ) : null}
          {deliveryError ? (
            <p className="text-[11px] text-[var(--th-review-danger-light)]">{deliveryError}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--th-edge)] py-2.5 pl-12 pr-3.5 text-xs font-medium">
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
          className="h-7 min-w-0 flex-1 rounded-md border border-[var(--th-edge)] bg-[var(--th-surface-mid)] px-2.5 font-normal outline-none placeholder:text-[var(--th-review-text-ghost)] focus:border-[var(--th-accent)]"
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
            onClick={() => onAsk(threadId)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--th-review-ai)]/30 px-2.5 text-[var(--th-review-ai-light)] hover:bg-[var(--th-review-ai)]/10"
          >
            <Sparkles size={11} /> Ask session
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            void mutateReview(RESOLVE, { threadId, resolved: !resolvedAt }).catch((error) =>
              toast.error(error instanceof Error ? error.message : "Update failed"),
            )
          }
          className="flex h-7 items-center rounded-md border border-[var(--th-edge)] px-2.5 text-[var(--th-heading)] hover:bg-white/5"
        >
          {resolvedAt ? "Unresolve" : "Resolve"}
        </button>
      </div>
    </article>
  );
}
