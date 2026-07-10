import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { SessionDetailView } from "./SessionDetailView";

export function AppSessionWorkspace({
  sessionId,
  scrollToEventId,
  onScrollComplete,
  onForkSession,
  canForkSession,
  canvasReady,
  canvas,
}: {
  sessionId: string | null;
  scrollToEventId: string | null;
  onScrollComplete: () => void;
  onForkSession: (eventId: string) => void;
  canForkSession: boolean;
  canvasReady: boolean;
  canvas: ReactNode;
}) {
  const [canvasRevealed, setCanvasRevealed] = useState(canvasReady);

  useEffect(() => {
    if (canvasReady) setCanvasRevealed(true);
  }, [canvasReady]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <motion.aside
        layout
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className={cn(
          "h-full shrink-0 bg-background",
          canvasRevealed ? "w-[clamp(22rem,33vw,34rem)] border-r border-border" : "w-full",
        )}
      >
        {sessionId ? (
          <SessionDetailView
            key={sessionId}
            sessionId={sessionId}
            hideHeader
            scrollToEventId={scrollToEventId}
            onScrollComplete={onScrollComplete}
            onForkSession={onForkSession}
            canForkSession={canForkSession}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading messages…
          </div>
        )}
      </motion.aside>
      <AnimatePresence initial={false}>
        {canvasRevealed ? (
          <motion.main
            key="app-canvas"
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={{ type: "spring", stiffness: 240, damping: 30 }}
            className="min-w-0 flex-1 bg-surface-deep"
          >
            {canvas}
          </motion.main>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
