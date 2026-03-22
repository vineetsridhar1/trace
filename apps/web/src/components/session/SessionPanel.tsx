import { useEffect, useCallback, useRef, useState } from "react";
import { useIsMobile } from "../../hooks/use-mobile";
import { SessionDetailView } from "./SessionDetailView";
import { cn } from "../../lib/utils";

/** Threshold: if panel exceeds this ratio of total width, snap to fullscreen */
const FULLSCREEN_SNAP_RATIO = 0.85;
/** Minimum panel ratio when resizing */
const MIN_PANEL_RATIO = 0.25;
/** Maximum panel ratio before fullscreen snap */
const MAX_PANEL_RATIO = FULLSCREEN_SNAP_RATIO;

export function SessionPanel({
  sessionId,
  isFullscreen,
  onClose,
  onToggleFullscreen,
}: {
  sessionId: string;
  isFullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const isMobile = useIsMobile();

  // Escape key closes panel (or exits fullscreen first)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isFullscreen) {
          onToggleFullscreen();
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isFullscreen, onClose, onToggleFullscreen]);

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-40 bg-background">
        <SessionDetailView
          sessionId={sessionId}
          panelMode
          onClose={onClose}
          onToggleFullscreen={onToggleFullscreen}
        />
      </div>
    );
  }

  return (
    <SessionDetailView
      sessionId={sessionId}
      panelMode
      isFullscreen={isFullscreen}
      onClose={onClose}
      onToggleFullscreen={onToggleFullscreen}
    />
  );
}

/**
 * Renders the session panel card alongside the main content card.
 * Includes a drag handle for resizing with auto-snap to fullscreen.
 */
export function SessionPanelSlot({
  sessionId,
  isFullscreen,
  onClose,
  onToggleFullscreen,
  containerRef,
  onSetFullscreen,
}: {
  sessionId: string | null;
  isFullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSetFullscreen: (fullscreen: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const hasSession = !!sessionId;

  // Custom panel ratio from drag (null = use default flex layout)
  const [panelRatio, setPanelRatio] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startRatio: 0 });

  // Reset custom ratio when session changes or enters fullscreen
  useEffect(() => {
    if (!sessionId || isFullscreen) setPanelRatio(null);
  }, [sessionId, isFullscreen]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const totalWidth = container.offsetWidth;
      const currentRatio = panelRatio ?? 0.55;
      dragRef.current = { startX: e.clientX, startRatio: currentRatio };
      setIsDragging(true);

      function onMouseMove(ev: MouseEvent) {
        const dx = dragRef.current.startX - ev.clientX;
        const newRatio = dragRef.current.startRatio + dx / totalWidth;
        const clamped = Math.max(MIN_PANEL_RATIO, Math.min(MAX_PANEL_RATIO, newRatio));
        setPanelRatio(clamped);
      }

      function onMouseUp(ev: MouseEvent) {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        setIsDragging(false);

        // Snap to fullscreen if past threshold
        const dx = dragRef.current.startX - ev.clientX;
        const finalRatio = dragRef.current.startRatio + dx / totalWidth;
        if (finalRatio > FULLSCREEN_SNAP_RATIO) {
          setPanelRatio(null);
          onSetFullscreen(true);
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [containerRef, panelRatio, onSetFullscreen],
  );

  // On mobile, render as a fixed overlay outside the flex layout
  if (isMobile && hasSession && sessionId) {
    return (
      <SessionPanel
        sessionId={sessionId}
        isFullscreen={false}
        onClose={onClose}
        onToggleFullscreen={onToggleFullscreen}
      />
    );
  }

  // Compute inline style for drag-based sizing
  const panelStyle: React.CSSProperties | undefined =
    hasSession && !isFullscreen && panelRatio != null
      ? { flexBasis: `${panelRatio * 100}%`, flexGrow: 0, flexShrink: 0 }
      : undefined;

  return (
    <>
      {/* Drag handle — only visible when panel is open and not fullscreen */}
      {hasSession && !isFullscreen && !isMobile && (
        <div
          onMouseDown={onDragStart}
          className={cn(
            "flex-none w-1 cursor-col-resize rounded-full hover:bg-border active:bg-accent",
            isDragging ? "bg-accent" : "bg-transparent",
          )}
        />
      )}

      <div
        className={cn(
          "min-w-0 overflow-hidden rounded-tl-lg rounded-tr-lg bg-background",
          // Disable transitions during drag for instant feedback
          isDragging ? "" : "transition-all duration-300 ease-in-out",
          hasSession
            ? "flex-[1.2_1_0%] border opacity-100"
            : "flex-[0_0_0%] border-transparent opacity-0",
          hasSession && isFullscreen && "flex-[1_1_0%]",
        )}
        style={panelStyle}
      >
        {sessionId && (
          <div className="h-full min-w-[400px]">
            <SessionPanel
              sessionId={sessionId}
              isFullscreen={isFullscreen}
              onClose={onClose}
              onToggleFullscreen={onToggleFullscreen}
            />
          </div>
        )}
      </div>
    </>
  );
}
