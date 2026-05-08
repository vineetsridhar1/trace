import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageSquarePlus, MessageSquareText, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Textarea } from "./textarea";
import type { MarkdownSteerBlock } from "./markdownSteering";

interface SteerableMarkdownBlockProps {
  block: MarkdownSteerBlock;
  comment: string;
  active: boolean;
  children: ReactNode;
  onOpen: (blockId: string) => void;
  onCancel: () => void;
  onSave: (block: MarkdownSteerBlock, text: string) => void;
  onRemove: (blockId: string) => void;
}

export function SteerableMarkdownBlock({
  block,
  comment,
  active,
  children,
  onOpen,
  onCancel,
  onSave,
  onRemove,
}: SteerableMarkdownBlockProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasComment = comment.trim().length > 0;

  useEffect(() => {
    if (!active) {
      setDraft("");
      return;
    }

    setDraft(comment);
    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [active, comment]);

  const handleOpen = useCallback(() => {
    onOpen(block.id);
  }, [block.id, onOpen]);

  const handleCancel = useCallback(() => {
    setDraft(comment);
    onCancel();
  }, [comment, onCancel]);

  const handleSave = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    onSave(block, text);
  }, [block, draft, onSave]);

  const handleRemove = useCallback(() => {
    setDraft("");
    onRemove(block.id);
  }, [block.id, onRemove]);

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
        "group/steer relative -mx-2 my-1 rounded-md border border-transparent px-2 py-1.5 transition-colors outline-none",
        "hover:border-accent/20 hover:bg-surface-elevated/40 focus-visible:border-accent/40 focus-visible:bg-surface-elevated/40 focus-visible:ring-1 focus-visible:ring-accent/40",
        hasComment && "border-accent/20 bg-surface-elevated/40",
        active && "border-accent/30 bg-surface-elevated/50",
      )}
    >
      <div className="min-w-0 pr-24">{children}</div>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={handleOpen}
        className={cn(
          "absolute right-1.5 top-1.5 h-6 rounded-md border border-border bg-surface-deep/95 px-2 text-[11px] text-muted-foreground shadow-sm transition-opacity hover:bg-surface-elevated hover:text-foreground",
          "opacity-0 pointer-events-none group-hover/steer:pointer-events-auto group-hover/steer:opacity-100 group-focus-within/steer:pointer-events-auto group-focus-within/steer:opacity-100",
          active && "pointer-events-auto opacity-100",
        )}
      >
        <MessageSquarePlus size={12} />
        {hasComment ? "Edit" : "Comment"}
      </Button>

      {hasComment && !active && (
        <div className="ml-4 mt-1.5 border-l border-accent/25 pl-2">
          <div className="rounded-md border border-border bg-surface px-2 py-1.5 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <MessageSquareText size={11} className="text-accent" />
              Comment
            </div>
            <p className="max-h-16 overflow-hidden text-xs leading-5 text-foreground/90">
              {comment}
            </p>
          </div>
        </div>
      )}

      {active && (
        <div className="ml-4 mt-1.5 border-l border-accent/25 pl-2">
          <div className="rounded-md border border-border bg-surface p-2 shadow-sm">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Add a comment..."
              className="min-h-16 resize-y rounded-md border-border bg-surface-deep px-2 py-1.5 text-xs"
            />
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <div>
                {hasComment && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleRemove}
                    title="Remove comment"
                    aria-label="Remove comment"
                    className="text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
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
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
