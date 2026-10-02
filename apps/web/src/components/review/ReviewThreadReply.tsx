import { useState } from "react";
import { gql } from "@urql/core";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { useReviewUiStore } from "../../stores/review-ui";
import { mutateReview } from "./review-operations";

const REPLY = gql`
  mutation ReplyToReviewThread($threadId: ID!, $body: String!) {
    replyToReviewThread(threadId: $threadId, body: $body) {
      id
    }
  }
`;
export function ReviewThreadReply({ threadId }: { threadId: string }) {
  const reply = useReviewUiStore((state) => state.replyDrafts[threadId] ?? "");
  const setReplyDraft = useReviewUiStore((state) => state.setReplyDraft);
  const setReply = (body: string) => setReplyDraft(threadId, body);
  const [sending, setSending] = useState(false);
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
    <>
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
    </>
  );
}
