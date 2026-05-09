import type { FocusEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { MarkdownSteerBlock, MarkdownSteerComment } from "./markdownSteering";
import { Popover } from "./popover";
import { SteerableMarkdownCommentPopover } from "./SteerableMarkdownCommentPopover";
import { SteerableMarkdownPreview } from "./SteerableMarkdownPreview";
import { SteerableMarkdownTrigger } from "./SteerableMarkdownTrigger";
import { useSteerableBlockPosition } from "./useSteerableBlockPosition";

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
  const [blockHovered, setBlockHovered] = useState(false);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentCount = comments.length;
  const hasComments = commentCount > 0;
  const commentLabel = commentCount === 1 ? "1 comment" : `${commentCount} comments`;
  const triggerVisible = blockHovered || triggerHovered || focused || active || hasComments;
  const triggerPosition = useSteerableBlockPosition(blockRef, triggerVisible);
  const previewVisible = hasComments && triggerHovered && !active;
  const [previewMounted, setPreviewMounted] = useState(false);

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

  useEffect(() => {
    if (previewVisible) {
      setPreviewMounted(true);
      return;
    }

    const timeoutId = window.setTimeout(() => setPreviewMounted(false), 180);
    return () => window.clearTimeout(timeoutId);
  }, [previewVisible]);

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

  const handleTriggerMouseLeave = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const element = blockRef.current;
      if (!element) {
        setTriggerHovered(false);
        return;
      }

      const rect = element.getBoundingClientRect();
      const isInsideBlock =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      setBlockHovered(isInsideBlock);
      setTriggerHovered(false);
    },
    [],
  );

  return (
    <div
      ref={blockRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setBlockHovered(true)}
      onMouseMove={() => setBlockHovered(true)}
      onMouseLeave={() => setBlockHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={cn(
        "group/steer relative -mx-2 my-1 rounded-md px-2 py-1.5 outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-accent/40",
      )}
    >
      <div className="min-w-0 pr-12">{children}</div>

      <Popover open={active} onOpenChange={handleOpenChange}>
        <SteerableMarkdownTrigger
          position={triggerPosition}
          hasComments={hasComments}
          commentCount={commentCount}
          onMouseEnter={() => setTriggerHovered(true)}
          onMouseLeave={handleTriggerMouseLeave}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onOpen={handleOpen}
        />
        {previewMounted ? (
          <SteerableMarkdownPreview
            blockId={block.id}
            comments={comments}
            commentLabel={commentLabel}
            position={triggerPosition}
            visible={previewVisible}
          />
        ) : null}
        <SteerableMarkdownCommentPopover
          comments={comments}
          commentLabel={commentLabel}
          draft={draft}
          textareaRef={textareaRef}
          onDraftChange={setDraft}
          onTextareaKeyDown={handleTextareaKeyDown}
          onCancel={handleCancel}
          onSave={handleSave}
          onRemove={handleRemove}
        />
      </Popover>
    </div>
  );
}
