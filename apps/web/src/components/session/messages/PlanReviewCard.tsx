import { useCallback, useMemo, useState } from "react";
import { Map, Send } from "lucide-react";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Markdown } from "../../ui/Markdown";
import { Button } from "../../ui/button";
import type { MarkdownSteerComment, MarkdownSteerBlock } from "../../ui/markdownSteering";
import { formatTime } from "./utils";

interface PlanReviewCardProps {
  sessionId: string;
  planContent: string;
  planFilePath: string;
  timestamp: string;
}

function getCommentIndex(comment: MarkdownSteerComment): number {
  const [index] = comment.id.split("-");
  const parsed = Number(index);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCommentPrompt(comments: MarkdownSteerComment[]): string {
  const commentText = comments
    .map(
      (comment, index) =>
        `Comment ${index + 1}\n\nSelected plan block:\n${comment.markdown}\n\nComment:\n${comment.text}`,
    )
    .join("\n\n---\n\n");

  return `Please revise the plan using these inline comments. Apply them together, keep the rest of the plan coherent, and do not start implementation yet.\n\n${commentText}`;
}

export function PlanReviewCard({
  sessionId,
  planContent,
  planFilePath,
  timestamp,
}: PlanReviewCardProps) {
  const [comments, setComments] = useState<Record<string, MarkdownSteerComment>>({});
  const [sendingComments, setSendingComments] = useState(false);

  const commentList = useMemo(
    () => Object.values(comments).sort((a, b) => getCommentIndex(a) - getCommentIndex(b)),
    [comments],
  );

  const handleSaveComment = useCallback((block: MarkdownSteerBlock, text: string) => {
    setComments((current) => ({
      ...current,
      [block.id]: {
        ...block,
        text,
      },
    }));
  }, []);

  const handleRemoveComment = useCallback((blockId: string) => {
    setComments((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
  }, []);

  const handleSendComments = useCallback(async () => {
    if (commentList.length === 0 || sendingComments) return;

    setSendingComments(true);
    try {
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: buildCommentPrompt(commentList),
          interactionMode: "plan",
        })
        .toPromise();
      setComments({});
    } finally {
      setSendingComments(false);
    }
  }, [commentList, sendingComments, sessionId]);

  const commentCount = commentList.length;
  const commentLabel =
    commentCount === 1 ? "1 inline comment" : `${commentCount} inline comments`;

  return (
    <div className="accent-dashed-container px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <Map size={16} className="text-accent" />
        <span className="text-sm font-medium text-accent">Plan Review</span>
        {planFilePath && (
          <span className="text-xs text-muted-foreground font-mono truncate">
            {planFilePath.split("/").pop()}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{formatTime(timestamp)}</span>
      </div>

      <Markdown
        steerableBlocks
        comments={comments}
        onSaveComment={handleSaveComment}
        onRemoveComment={handleRemoveComment}
      >
        {planContent}
      </Markdown>

      {commentCount > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
          <span className="text-xs text-muted-foreground">{commentLabel}</span>
          <Button
            type="button"
            size="xs"
            onClick={() => void handleSendComments()}
            disabled={sendingComments}
            className="h-6 rounded-md bg-accent px-2 text-[11px] text-accent-foreground hover:bg-accent/90"
          >
            <Send size={12} />
            Send comments
          </Button>
        </div>
      )}
    </div>
  );
}
