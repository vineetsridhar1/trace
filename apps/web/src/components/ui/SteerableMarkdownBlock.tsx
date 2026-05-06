import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Textarea } from "./textarea";
import type { MarkdownSteerBlock } from "./markdownSteering";

interface SteerableMarkdownBlockProps {
  block: MarkdownSteerBlock;
  active: boolean;
  children: ReactNode;
  onOpen: (blockId: string) => void;
  onCancel: () => void;
  onSubmit: (block: MarkdownSteerBlock, feedback: string) => Promise<void> | void;
}

export function SteerableMarkdownBlock({
  block,
  active,
  children,
  onOpen,
  onCancel,
  onSubmit,
}: SteerableMarkdownBlockProps) {
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!active) {
      setFeedback("");
      setSending(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [active]);

  const handleOpen = useCallback(() => {
    onOpen(block.id);
  }, [block.id, onOpen]);

  const handleCancel = useCallback(() => {
    setFeedback("");
    onCancel();
  }, [onCancel]);

  const handleSubmit = useCallback(async () => {
    const text = feedback.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      await onSubmit(block, text);
      setFeedback("");
    } finally {
      setSending(false);
    }
  }, [block, feedback, onSubmit, sending]);

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
        void handleSubmit();
      }
    },
    [handleCancel, handleSubmit],
  );

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "group/steer relative -mx-2 my-1 rounded-md border border-transparent px-2 py-1.5 transition-colors outline-none",
        "hover:border-accent/20 hover:bg-accent/5 focus-visible:border-accent/40 focus-visible:bg-accent/5 focus-visible:ring-1 focus-visible:ring-accent/40",
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
        Steer
      </Button>

      {active && (
        <div className="mt-2 rounded-md border border-accent/25 bg-surface-deep p-2">
          <Textarea
            ref={textareaRef}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            disabled={sending}
            placeholder="Suggest a revision for this part..."
            className="min-h-20 resize-y border-border bg-surface text-sm"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={sending}
              className="h-7 rounded-md text-xs text-muted-foreground"
            >
              <X size={13} />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={!feedback.trim() || sending}
              className="h-7 rounded-md bg-accent px-2.5 text-xs text-accent-foreground hover:bg-accent/90"
            >
              <Send size={13} />
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
