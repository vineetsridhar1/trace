import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageSquareText, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Textarea } from "./textarea";
import type { MarkdownSteerBlock } from "./markdownSteering";

interface SteerableMarkdownBlockProps {
  block: MarkdownSteerBlock;
  annotation: string;
  active: boolean;
  children: ReactNode;
  onOpen: (blockId: string) => void;
  onCancel: () => void;
  onSave: (block: MarkdownSteerBlock, feedback: string) => void;
  onRemove: (blockId: string) => void;
}

export function SteerableMarkdownBlock({
  block,
  annotation,
  active,
  children,
  onOpen,
  onCancel,
  onSave,
  onRemove,
}: SteerableMarkdownBlockProps) {
  const [feedback, setFeedback] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasAnnotation = annotation.trim().length > 0;

  useEffect(() => {
    if (!active) {
      setFeedback("");
      return;
    }

    setFeedback(annotation);
    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [active, annotation]);

  const handleOpen = useCallback(() => {
    onOpen(block.id);
  }, [block.id, onOpen]);

  const handleCancel = useCallback(() => {
    setFeedback(annotation);
    onCancel();
  }, [annotation, onCancel]);

  const handleSave = useCallback(() => {
    const text = feedback.trim();
    if (!text) return;

    onSave(block, text);
  }, [block, feedback, onSave]);

  const handleRemove = useCallback(() => {
    setFeedback("");
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
        "hover:border-accent/20 hover:bg-accent/5 focus-visible:border-accent/40 focus-visible:bg-accent/5 focus-visible:ring-1 focus-visible:ring-accent/40",
        hasAnnotation && "border-accent/20 bg-accent/5",
        active && "border-accent/30 bg-accent/5",
      )}
    >
      <div className="min-w-0 pr-16">{children}</div>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={handleOpen}
        className={cn(
          "absolute right-1.5 top-1.5 h-6 rounded-md border border-accent/20 bg-surface-deep/90 px-2 text-[11px] text-accent shadow-sm transition-opacity hover:bg-accent/10",
          "opacity-0 pointer-events-none group-hover/steer:pointer-events-auto group-hover/steer:opacity-100 group-focus-within/steer:pointer-events-auto group-focus-within/steer:opacity-100",
          active && "pointer-events-auto opacity-100",
        )}
      >
        {hasAnnotation ? "Edit" : "Steer"}
      </Button>

      {hasAnnotation && !active && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-accent/15 bg-accent/5 px-2 py-1 text-xs leading-5 text-muted-foreground">
          <MessageSquareText size={12} className="mt-1 shrink-0 text-accent" />
          <span className="max-h-10 overflow-hidden">{annotation}</span>
        </div>
      )}

      {active && (
        <div className="mt-1.5 rounded-md border border-border bg-surface-deep p-1.5">
          <Textarea
            ref={textareaRef}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Suggest a revision for this part..."
            className="min-h-16 resize-y rounded-md border-border bg-surface px-2 py-1.5 text-xs"
          />
          <div className="mt-1.5 flex items-center justify-between gap-1">
            <div>
              {hasAnnotation && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleRemove}
                  title="Remove annotation"
                  aria-label="Remove annotation"
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
                disabled={!feedback.trim()}
                className="h-6 rounded-md bg-accent px-2 text-[11px] text-accent-foreground hover:bg-accent/90"
              >
                <Check size={12} />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
