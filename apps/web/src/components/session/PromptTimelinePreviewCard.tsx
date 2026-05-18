import { AnimatePresence, motion } from "framer-motion";
import { ImageIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import type { PromptTimelineItem } from "./promptTimelineTypes";

interface PromptTimelinePreviewCardProps {
  preview: { item: PromptTimelineItem; index: number } | null;
  top: number;
  placement: "below" | "center";
}

export function PromptTimelinePreviewCard({
  preview,
  top,
  placement,
}: PromptTimelinePreviewCardProps) {
  return (
    <AnimatePresence>
      {preview ? (
        <motion.div
          initial={{ opacity: 0, x: 10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 8, scale: 0.98 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={{ top }}
          className={cn(
            "pointer-events-none absolute right-full mr-3 w-72 overflow-hidden rounded-2xl border border-border bg-surface-elevated/95 p-3 text-left backdrop-blur-xl",
            placement === "below" ? "translate-y-0" : "-translate-y-1/2",
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">{preview.item.actorName}</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>{preview.item.timestamp}</span>
          </div>
          <p className="max-h-24 overflow-hidden text-sm leading-5 text-foreground">
            {preview.item.text}
          </p>
          {preview.item.imageCount > 0 ? (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ImageIcon size={12} />
              <span>
                {preview.item.imageCount} image{preview.item.imageCount === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
