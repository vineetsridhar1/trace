import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageSquarePlus, MessageSquareText, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
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
        "group/steer relative -mx-2 my-1 rounded-md px-2 py-1.5 outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-accent/40",
      )}
    >
      <div className="min-w-0 pr-24">{children}</div>

      <Popover open={active} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          title={hasComment ? "Edit comment" : "Add comment"}
          aria-label={hasComment ? "Edit comment" : "Add comment"}
          className={cn(
            "absolute right-0 top-1.5 z-10 flex h-6 translate-x-1/2 items-center justify-center gap-1 rounded-full border text-[11px] shadow-sm transition-all outline-none",
            "focus-visible:ring-2 focus-visible:ring-accent/40",
            hasComment
              ? "min-w-8 border-accent/40 bg-accent px-2 text-accent-foreground opacity-100 hover:bg-accent/90"
              : "pointer-events-none w-6 border-border bg-surface-deep text-muted-foreground opacity-0 hover:bg-surface-elevated hover:text-foreground group-hover/steer:pointer-events-auto group-hover/steer:opacity-100 group-focus-within/steer:pointer-events-auto group-focus-within/steer:opacity-100",
            active && "pointer-events-auto opacity-100",
          )}
        >
          {hasComment ? <MessageSquareText size={12} /> : <MessageSquarePlus size={12} />}
          {hasComment && <span>1</span>}
        </PopoverTrigger>

        <PopoverContent
          side="right"
          align="start"
          sideOffset={10}
          className="w-80 gap-2 rounded-md border border-border bg-surface p-2 shadow-xl ring-1 ring-foreground/10"
        >
          <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground">
            <MessageSquareText size={13} className="text-accent" />
            {hasComment ? "Edit comment" : "Add comment"}
          </div>
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
