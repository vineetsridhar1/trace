import { useState } from "react";
import { gql } from "@urql/core";
import type { ReviewThread as ReviewThreadType } from "@trace/gql";
import { CheckCircle2, Circle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { mutateReview } from "./review-operations";

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
const SELECT = gql`
  mutation SelectReviewThread($threadId: ID!, $selected: Boolean!) {
    setReviewThreadSelected(threadId: $threadId, selected: $selected) {
      id
    }
  }
`;

export function ReviewThread({ thread }: { thread: ReviewThreadType }) {
  const [reply, setReply] = useState("");
  const selected = thread.deliveryStatus === "selected";
  const delivered = thread.deliveryStatus === "delivered";
  return (
    <div className="mx-3 my-2 rounded-lg border border-border bg-surface-deep p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">{thread.author.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {thread.scope.replace("_", " ")}
          {thread.anchor
            ? ` · ${thread.anchor.side} ${thread.anchor.startLine}${thread.anchor.endLine !== thread.anchor.startLine ? `–${thread.anchor.endLine}` : ""}`
            : ""}
        </span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground"
          onClick={() =>
            void mutateReview(RESOLVE, { threadId: thread.id, resolved: !thread.resolvedAt }).catch(
              (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
            )
          }
        >
          {thread.resolvedAt ? <CheckCircle2 size={12} /> : <Circle size={12} />}
          {thread.resolvedAt ? "Resolved" : "Resolve"}
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {thread.comments
          .filter((comment) => !comment.deletedAt)
          .map((comment) => (
            <div key={comment.id}>
              <span className="mr-2 text-[10px] font-medium text-muted-foreground">
                {comment.author.name}
              </span>
              <span className="whitespace-pre-wrap">{comment.body}</span>
            </div>
          ))}
      </div>
      {thread.deliveryError ? (
        <p className="mt-2 text-[10px] text-destructive">{thread.deliveryError}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-1">
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Reply in Trace…"
          className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={!reply.trim()}
          onClick={() =>
            void mutateReview(REPLY, { threadId: thread.id, body: reply.trim() })
              .then(() => setReply(""))
              .catch((error) =>
                toast.error(error instanceof Error ? error.message : "Reply failed"),
              )
          }
        >
          <Send size={11} />
        </Button>
        <label className="ml-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={selected || delivered}
            disabled={delivered}
            onChange={() =>
              void mutateReview(SELECT, { threadId: thread.id, selected: !selected }).catch(
                (error) => toast.error(error instanceof Error ? error.message : "Selection failed"),
              )
            }
          />
          {delivered ? "Delivered" : "Send to GitHub"}
        </label>
      </div>
    </div>
  );
}
