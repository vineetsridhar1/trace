import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquareText } from "lucide-react";

import type { MarkdownSteerComment } from "./markdownSteering";
import {
  STEERABLE_PREVIEW_WIDTH,
  type SteerableBlockPosition,
} from "./useSteerableBlockPosition";

interface SteerableMarkdownPreviewProps {
  blockId: string;
  comments: MarkdownSteerComment[];
  commentLabel: string;
  position: SteerableBlockPosition | null;
  visible: boolean;
}

export function SteerableMarkdownPreview({
  blockId,
  comments,
  commentLabel,
  position,
  visible,
}: SteerableMarkdownPreviewProps) {
  const style: CSSProperties | undefined = position
    ? {
        position: "fixed",
        top: position.top,
        left: position.previewLeft,
        width: STEERABLE_PREVIEW_WIDTH,
      }
    : undefined;

  const preview = (
    <AnimatePresence>
      {visible && style ? (
        <motion.div
          key={blockId}
          style={style}
          initial={{ opacity: 0, x: -6, y: 2, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: -6, y: 2, scale: 0.98 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="pointer-events-none z-50 overflow-hidden rounded-lg border border-primary/20 bg-surface-elevated/95 p-1.5 text-xs shadow-2xl ring-1 ring-primary/15 backdrop-blur"
        >
          <div className="flex items-center gap-1.5 px-1.5 py-1 font-medium text-foreground">
            <MessageSquareText size={13} className="text-primary" />
            {commentLabel}
          </div>
          <div className="max-h-48 space-y-1 overflow-hidden">
            {comments.map((comment) => (
              <p
                key={comment.commentId}
                className="rounded-md bg-surface px-2.5 py-2 leading-5 text-foreground/90 shadow-sm"
              >
                {comment.text}
              </p>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return typeof document !== "undefined" ? createPortal(preview, document.body) : preview;
}
