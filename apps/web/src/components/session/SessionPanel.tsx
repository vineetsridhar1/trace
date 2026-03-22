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
/** Default panel width ratio */
const DEFAULT_RATIO = 0.55;
/** localStorage key for persisted panel width */
const STORAGE_KEY = "trace:session-panel-width";

/** CSS properties that actually change between panel states */
const PANEL_TRANSITION = "transition-[flex-basis,flex-grow,opacity,border-color] duration-300 ease-in-out";

function loadPersistedRatio(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = parseFloat(stored);
      if (val >= MIN_PANEL_RATIO && val <= MAX_PANEL_RATIO) return val;
    }
  } catch {
    // ignore
  }
  return DEFAULT_RATIO;
}

function persistRatio(ratio: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(ratio));
  } catch {
    // ignore
  }
}

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

  // Escape key closes panel (or exits fullscreen first).
  // Skips when focus is inside an input/textarea to avoid interrupting typing.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (isFullscreen) {
        onToggleFullscreen();
      } else {
        onClose();
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
 * Panel width is persisted in localStorage.
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

  // Panel ratio — initialized from localStorage
  const [panelRatio, setPanelRatio] = useState(loadPersistedRatio);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startRatio: 0 });

  // Ref to clean up drag listeners if the component unmounts mid-drag
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // Keep a ref to panelRatio so the drag handler always reads the latest value
  const panelRatioRef = useRef(panelRatio);
  panelRatioRef.current = panelRatio;

  // Persist ratio on change (but not during drag — too frequent)
  const persistOnDragEnd = useCallback((ratio: number) => {
    setPanelRatio(ratio);
    persistRatio(ratio);
  }, []);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const totalWidth = container.offsetWidth;
      dragRef.current = { startX: e.clientX, startRatio: panelRatioRef.current };
      setIsDragging(true);

      function onMouseMove(ev: MouseEvent) {
        const dx = dragRef.current.startX - ev.clientX;
        const newRatio = dragRef.current.startRatio + dx / totalWidth;
        const clamped = Math.max(MIN_PANEL_RATIO, Math.min(MAX_PANEL_RATIO, newRatio));
        setPanelRatio(clamped);
      }

      function cleanup() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        dragCleanupRef.current = null;
      }

      function onMouseUp(ev: MouseEvent) {
        cleanup();
        setIsDragging(false);

        // Snap to fullscreen if past threshold
        const dx = dragRef.current.startX - ev.clientX;
        const finalRatio = dragRef.current.startRatio + dx / totalWidth;
        if (finalRatio > FULLSCREEN_SNAP_RATIO) {
          onSetFullscreen(true);
        } else {
          const clamped = Math.max(MIN_PANEL_RATIO, Math.min(MAX_PANEL_RATIO, finalRatio));
          persistOnDragEnd(clamped);
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      dragCleanupRef.current = cleanup;
    },
    [containerRef, onSetFullscreen, persistOnDragEnd],
  );

  // On mobile, render as a fixed overlay outside the flex layout
  if (isMobile && hasSession) {
    return (
      <SessionPanel
        sessionId={sessionId}
        isFullscreen={false}
        onClose={onClose}
        onToggleFullscreen={onToggleFullscreen}
      />
    );
  }

  // Always use inline flex-basis so transitions are smooth between all states:
  // - closed: flex-basis 0%
  // - open: flex-basis from panelRatio (e.g. 55%)
  // - fullscreen: flex-basis 100%
  let flexBasis: string;
  if (!hasSession) {
    flexBasis = "0%";
  } else if (isFullscreen) {
    flexBasis = "100%";
  } else {
    flexBasis = `${panelRatio * 100}%`;
  }

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
          isDragging ? "" : PANEL_TRANSITION,
          hasSession ? "border opacity-100" : "border-transparent opacity-0",
        )}
        style={{ flexBasis, flexGrow: isFullscreen ? 1 : 0, flexShrink: 0 }}
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
