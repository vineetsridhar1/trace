import type { CSSProperties, FocusEventHandler, MouseEventHandler } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus, MessageSquareText } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SteerableBlockPosition } from "./useSteerableBlockPosition";
import { PopoverTrigger } from "./popover";

interface SteerableMarkdownTriggerProps {
  position: SteerableBlockPosition | null;
  hasComments: boolean;
  commentCount: number;
  onMouseEnter: MouseEventHandler<HTMLDivElement>;
  onMouseLeave: MouseEventHandler<HTMLDivElement>;
  onFocus: FocusEventHandler<HTMLDivElement>;
  onBlur: FocusEventHandler<HTMLDivElement>;
  onOpen: () => void;
}

export function SteerableMarkdownTrigger({
  position,
  hasComments,
  commentCount,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onOpen,
}: SteerableMarkdownTriggerProps) {
  if (!position) return null;

  const style: CSSProperties = {
    position: "fixed",
    top: position.top,
    left: position.left,
  };

  const trigger = (
    <div
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className="pointer-events-none z-50 flex h-9 w-0 justify-center"
    >
      <PopoverTrigger
        aria-label={hasComments ? "View comments" : "Add comment"}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
        className={cn(
          "pointer-events-auto flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border text-xs opacity-100 shadow-md ring-1 transition-all outline-none",
          "focus-visible:ring-2 focus-visible:ring-primary/50",
          hasComments
            ? "min-w-11 border-primary/45 bg-surface-elevated px-2.5 text-foreground ring-primary/25 hover:border-primary/70 hover:bg-surface"
            : "w-9 border-primary/35 bg-surface-elevated text-primary ring-primary/20 hover:border-primary/60 hover:bg-surface",
        )}
      >
        {hasComments ? (
          <MessageSquareText size={16} className="text-primary" />
        ) : (
          <MessageSquarePlus size={16} className="text-primary" />
        )}
        {hasComments && <span className="font-medium text-foreground">{commentCount}</span>}
      </PopoverTrigger>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(trigger, document.body) : trigger;
}
