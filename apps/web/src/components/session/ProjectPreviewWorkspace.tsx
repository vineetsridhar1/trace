import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";
import { useSidebar } from "../ui/sidebar";
import { SessionDetailView } from "./SessionDetailView";

export function ProjectPreviewWorkspace({
  sessionId,
  scrollToEventId,
  onScrollComplete,
  onForkSession,
  canForkSession,
  canvasReady,
  canvasKey,
  canvas,
  showCanvasWhileLoading = false,
}: {
  sessionId: string | null;
  scrollToEventId: string | null;
  onScrollComplete: () => void;
  onForkSession: (eventId: string) => void;
  canForkSession: boolean;
  canvasReady: boolean;
  canvasKey: string;
  canvas: ReactNode;
  showCanvasWhileLoading?: boolean;
}) {
  const [canvasRevealed, setCanvasRevealed] = useState(canvasReady || showCanvasWhileLoading);
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
    if (!canvasReady && !showCanvasWhileLoading) return;
    setCanvasRevealed(true);
    if (!canvasReady) return;
    if (hasCollapsedRef.current) return;
    hasCollapsedRef.current = true;
    const wasOpen = isMobile ? openMobile : open;
    if (!wasOpen) return;
    collapsedByUsRef.current = true;
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  }, [canvasReady, isMobile, open, openMobile, setOpen, setOpenMobile, showCanvasWhileLoading]);

  useEffect(() => {
    return () => {
      if (!collapsedByUsRef.current) return;
      const {
        isMobile: mobile,
        setOpen: setDesktopOpen,
        setOpenMobile: setMobileOpen,
      } = sidebarApiRef.current;
      if (mobile) setMobileOpen(true);
      else setDesktopOpen(true);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex h-full min-h-0",
        isMobile
          ? "snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          : "overflow-hidden",
      )}
    >
      <motion.aside
        layout
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 32 }
        }
        className={cn(
          "h-full shrink-0 bg-background",
          isMobile
            ? "w-full min-w-full snap-start snap-always"
            : canvasRevealed
              ? "w-[clamp(22rem,33vw,34rem)] border-r border-border"
              : "w-full",
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
            key={canvasKey}
            initial={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 30 }
            }
            className={cn(
              "bg-surface-deep",
              isMobile ? "w-full min-w-full shrink-0 snap-start snap-always" : "min-w-0 flex-1",
            )}
          >
            {canvas}
          </motion.main>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
