import type { KeyboardEvent, RefObject } from "react";
import { Check, MessageSquareText, Trash2, X } from "lucide-react";

import { Button } from "./button";
import type { MarkdownSteerComment } from "./markdownSteering";
import { PopoverContent } from "./popover";
import { Textarea } from "./textarea";

interface SteerableMarkdownCommentPopoverProps {
  comments: MarkdownSteerComment[];
  commentLabel: string;
  draft: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (draft: string) => void;
  onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCancel: () => void;
  onSave: () => void;
  onRemove: (commentId: string) => void;
}

export function SteerableMarkdownCommentPopover({
  comments,
  commentLabel,
  draft,
  textareaRef,
  onDraftChange,
  onTextareaKeyDown,
  onCancel,
  onSave,
  onRemove,
}: SteerableMarkdownCommentPopoverProps) {
  const hasComments = comments.length > 0;

  return (
    <PopoverContent
      side="right"
      align="start"
      sideOffset={10}
      className="w-80 gap-2 rounded-md border border-border bg-surface p-2 shadow-xl ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground">
        <MessageSquareText size={13} className="text-accent" />
        {hasComments ? commentLabel : "Add comment"}
      </div>
      {hasComments && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-surface-deep/60 p-1">
          {comments.map((comment) => (
            <div
              key={comment.commentId}
              className="group/comment flex items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-5 text-foreground/90 hover:bg-surface-elevated"
            >
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{comment.text}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(comment.commentId)}
                title="Remove comment"
                aria-label="Remove comment"
                className="opacity-0 text-muted-foreground hover:text-red-400 group-hover/comment:opacity-100"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div>
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onTextareaKeyDown}
          placeholder="Add a comment..."
          className="min-h-20 resize-y rounded-md border-border bg-surface-deep px-2 py-1.5 text-xs"
        />
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <div />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onCancel}
              title="Cancel"
              aria-label="Cancel"
              className="text-muted-foreground"
            >
              <X size={12} />
            </Button>
            <Button
              type="button"
              size="xs"
              onClick={onSave}
              disabled={!draft.trim()}
              className="h-6 rounded-md bg-accent px-2 text-[11px] text-accent-foreground hover:bg-accent/90"
            >
              <Check size={12} />
              Add
            </Button>
          </div>
        </div>
      </div>
    </PopoverContent>
  );
}
