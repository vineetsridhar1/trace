import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";
import { useSidebar } from "../ui/sidebar";
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
  const hasCollapsedRef = useRef(false);
  const collapsedByUsRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const { isMobile, open, openMobile, setOpen, setOpenMobile } = useSidebar();

  // Keep the sidebar API fresh for the unmount cleanup below without re-running
  // the restore effect on every dependency change.
  const sidebarApiRef = useRef({ isMobile, setOpen, setOpenMobile });
  useEffect(() => {
    sidebarApiRef.current = { isMobile, setOpen, setOpenMobile };
  });

  useEffect(() => {
    if (!canvasReady) return;
    setCanvasRevealed(true);
    if (hasCollapsedRef.current) return;
    hasCollapsedRef.current = true;
    // Only collapse (and later restore) if the sidebar was open — if the user
    // had already collapsed it themselves, leave it alone.
    const wasOpen = isMobile ? openMobile : open;
    if (!wasOpen) return;
    collapsedByUsRef.current = true;
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  }, [canvasReady, isMobile, open, openMobile, setOpen, setOpenMobile]);

  // Restore the shared sidebar when leaving the app canvas, but only if we were
  // the ones who collapsed it.
  useEffect(() => {
    return () => {
      if (!collapsedByUsRef.current) return;
      const { isMobile: mobile, setOpen: open_, setOpenMobile: openMobile_ } = sidebarApiRef.current;
      if (mobile) openMobile_(true);
      else open_(true);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <motion.aside
        layout
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 32 }
        }
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
            initial={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 30 }
            }
            className="min-w-0 flex-1 bg-surface-deep"
          >
            {canvas}
          </motion.main>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
