import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const TRIGGER_SIZE = 32;
const TRIGGER_TOP_OFFSET = 12;
const BLOCK_TOP_INSET = 6;
const VIEWPORT_SIDE_INSET = 18;

interface TriggerPosition {
  top: number;
  left: number;
}

function getScrollContainer(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;

  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState<TriggerPosition | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentCount = comments.length;
  const hasComments = commentCount > 0;
  const commentLabel = commentCount === 1 ? "1 comment" : `${commentCount} comments`;
  const triggerVisible = hovered || focused || active || hasComments;

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

  const updateTriggerPosition = useCallback(() => {
    const element = blockRef.current;
    if (!element) return;

    const blockRect = element.getBoundingClientRect();
    const scrollContainer = getScrollContainer(element);
    const scrollRect = scrollContainer?.getBoundingClientRect();
    const containerTop = scrollRect?.top ?? 0;
    const visibleTop = containerTop + TRIGGER_TOP_OFFSET;
    const visibleBottom = scrollRect?.bottom ?? window.innerHeight;

    if (blockRect.bottom <= containerTop || blockRect.top >= visibleBottom) {
      setTriggerPosition(null);
      return;
    }

    const blockTop = blockRect.top + BLOCK_TOP_INSET;
    const blockBottom = blockRect.bottom - TRIGGER_SIZE - BLOCK_TOP_INSET;
    const top = Math.min(Math.max(blockTop, visibleTop), blockBottom);
    const left = Math.min(
      Math.max(blockRect.right, VIEWPORT_SIDE_INSET),
      window.innerWidth - VIEWPORT_SIDE_INSET,
    );

    setTriggerPosition((current) => {
      if (current && current.top === top && current.left === left) return current;
      return { top, left };
    });
  }, []);

  useLayoutEffect(() => {
    if (!triggerVisible) {
      setTriggerPosition(null);
      return;
    }

    let frameId: number | null = null;
    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateTriggerPosition();
      });
    };

    updateTriggerPosition();
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [triggerVisible, updateTriggerPosition]);

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

  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setFocused(false);
  }, []);

  const triggerRailStyle: CSSProperties | undefined = triggerPosition
    ? {
        position: "fixed",
        top: triggerPosition.top,
        left: triggerPosition.left,
      }
    : undefined;

  const triggerRail =
    triggerVisible && triggerRailStyle ? (
      <div
        style={triggerRailStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="pointer-events-none z-50 flex h-8 w-0 justify-center"
      >
        <PopoverTrigger
          title={hasComments ? "View comments" : "Add comment"}
          aria-label={hasComments ? "View comments" : "Add comment"}
          className={cn(
            "pointer-events-auto flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border text-xs opacity-100 shadow-sm transition-all outline-none",
            "focus-visible:ring-2 focus-visible:ring-accent/40",
            hasComments
              ? "min-w-10 border-accent/40 bg-accent px-2.5 text-accent-foreground hover:bg-accent/90"
              : "w-8 border-border bg-surface-deep text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
          )}
        >
          {hasComments ? <MessageSquareText size={15} /> : <MessageSquarePlus size={15} />}
          {hasComments && <span>{commentCount}</span>}
        </PopoverTrigger>
      </div>
    ) : null;

  return (
    <div
      ref={blockRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={cn(
        "group/steer relative -mx-2 my-1 rounded-md px-2 py-1.5 outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-accent/40",
      )}
    >
      <div className="min-w-0 pr-12">{children}</div>

      <Popover open={active} onOpenChange={handleOpenChange}>
        {triggerRail && typeof document !== "undefined"
          ? createPortal(triggerRail, document.body)
          : triggerRail}

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
