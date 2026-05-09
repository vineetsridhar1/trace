import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageSquarePlus, MessageSquareText, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Textarea } from "./textarea";
import type { MarkdownSteerBlock, MarkdownSteerComment } from "./markdownSteering";

interface SteerableMarkdownBlockProps {
  block: MarkdownSteerBlock;
  comments: MarkdownSteerComment[];
  active: boolean;
  children: ReactNode;
  onOpen: (blockId: string) => void;
  onCancel: () => void;
  onAdd: (block: MarkdownSteerBlock, text: string) => void;
  onRemove: (blockId: string, commentId: string) => void;
}

export function SteerableMarkdownBlock({
  block,
  comments,
  active,
  children,
  onOpen,
  onCancel,
  onAdd,
  onRemove,
}: SteerableMarkdownBlockProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentCount = comments.length;
  const hasComments = commentCount > 0;
  const commentLabel = commentCount === 1 ? "1 comment" : `${commentCount} comments`;

  useEffect(() => {
    if (!active) {
      setDraft("");
      return;
    }

    setDraft("");
    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [active]);

  const handleOpen = useCallback(() => {
    onOpen(block.id);
  }, [block.id, onOpen]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        handleOpen();
      } else {
        onCancel();
      }
    },
    [handleOpen, onCancel],
  );

  const handleCancel = useCallback(() => {
    setDraft("");
    onCancel();
  }, [onCancel]);

  const handleSave = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    onAdd(block, text);
    setDraft("");
  }, [block, draft, onAdd]);

  const handleRemove = useCallback(
    (commentId: string) => {
      onRemove(block.id, commentId);
    },
    [block.id, onRemove],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && active) {
        event.preventDefault();
        handleCancel();
      }
    },
    [active, handleCancel],
  );

  const handleTextareaKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSave();
      }
    },
    [handleCancel, handleSave],
  );

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "group/steer relative -mx-2 my-1 rounded-md px-2 py-1.5 outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-accent/40",
      )}
    >
      <Popover open={active} onOpenChange={handleOpenChange}>
        <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-start">
          <div className="min-w-0 pr-3">{children}</div>

          <div className="pointer-events-none sticky top-3 z-10 flex h-8 justify-end self-start">
            <PopoverTrigger
              title={hasComments ? "View comments" : "Add comment"}
              aria-label={hasComments ? "View comments" : "Add comment"}
              className={cn(
                "flex h-8 min-w-8 translate-x-1/2 items-center justify-center gap-1 rounded-full border text-xs shadow-sm transition-all outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent/40",
                hasComments
                  ? "pointer-events-auto min-w-10 border-accent/40 bg-accent px-2.5 text-accent-foreground opacity-100 hover:bg-accent/90"
                  : "pointer-events-none w-8 border-border bg-surface-deep text-muted-foreground opacity-0 hover:bg-surface-elevated hover:text-foreground group-hover/steer:pointer-events-auto group-hover/steer:opacity-100 group-focus-within/steer:pointer-events-auto group-focus-within/steer:opacity-100",
                active && "pointer-events-auto opacity-100",
              )}
            >
              {hasComments ? <MessageSquareText size={15} /> : <MessageSquarePlus size={15} />}
              {hasComments && <span>{commentCount}</span>}
            </PopoverTrigger>
          </div>
        </div>

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
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {comment.text}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemove(comment.commentId)}
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
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
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
                  onClick={handleCancel}
                  title="Cancel"
                  aria-label="Cancel"
                  className="text-muted-foreground"
                >
                  <X size={12} />
                </Button>
                <Button
                  type="button"
                  size="xs"
                  onClick={handleSave}
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
      </Popover>
    </div>
  );
}
