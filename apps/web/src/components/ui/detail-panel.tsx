import { useEffect, useCallback, useRef, useState } from "react";
import { useIsMobile } from "../../hooks/use-mobile";
import { useDetailPanelStore } from "../../stores/detail-panel";
import { cn } from "../../lib/utils";

/** Threshold: if panel exceeds this ratio of total width, snap to fullscreen */
const DEFAULT_FULLSCREEN_SNAP_RATIO = 0.85;
/** Minimum panel ratio when resizing */
const DEFAULT_MIN_RATIO = 0.25;
/** Default panel width ratio */
const DEFAULT_RATIO = 0.55;
/** Default localStorage key (matches the key used by the original SessionPanel) */
const DEFAULT_STORAGE_KEY = "trace:session-panel-width";

/** CSS properties that actually change between panel states */
const PANEL_TRANSITION = "transition-[flex-basis,flex-grow,border-color] duration-300 ease-in-out";

function loadPersistedRatio(storageKey: string, minRatio: number, maxRatio: number, defaultRatio: number): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const val = parseFloat(stored);
      if (val >= minRatio && val <= maxRatio) return val;
    }
  } catch {
    // ignore
  }
  return defaultRatio;
}

function persistRatio(storageKey: string, ratio: number) {
  try {
    localStorage.setItem(storageKey, String(ratio));
  } catch {
    // ignore
  }
}

interface DetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  storageKey?: string;
  defaultRatio?: number;
  minRatio?: number;
  fullscreenSnapRatio?: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Called after the close animation finishes and children are unmounted */
  onClosed?: () => void;
}

export function DetailPanel({
  isOpen,
  onClose,
  children,
  storageKey = DEFAULT_STORAGE_KEY,
  defaultRatio = DEFAULT_RATIO,
  minRatio = DEFAULT_MIN_RATIO,
  fullscreenSnapRatio = DEFAULT_FULLSCREEN_SNAP_RATIO,
  containerRef,
  onClosed,
}: DetailPanelProps) {
  const isMobile = useIsMobile();
  const isFullscreen = useDetailPanelStore((s) => s.isFullscreen);
  const setFullscreen = useDetailPanelStore((s) => s.setFullscreen);
  const toggleFullscreen = useDetailPanelStore((s) => s.toggleFullscreen);

  const maxRatio = fullscreenSnapRatio;

  // Keep children mounted during the close animation, unmount after transition ends
  const [showContent, setShowContent] = useState(isOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  // Stable ref for onClosed so the timeout fallback doesn't go stale
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // Guard against double-firing between transitionend and timeout fallback
  const closeCleanedUpRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const runCloseCleanup = useCallback(() => {
    if (closeCleanedUpRef.current) return;
    closeCleanedUpRef.current = true;
    clearTimeout(closeTimerRef.current);
    setFullscreen(false);
    setShowContent(false);
    onClosedRef.current?.();
  }, [setFullscreen]);

  useEffect(() => {
    if (isOpen) {
      setShowContent(true);
      closeCleanedUpRef.current = false;
    } else {
      // Fallback: if transitionend doesn't fire (e.g. no actual value change,
      // display:none, or browser coalesces), clean up after the transition duration
      closeTimerRef.current = setTimeout(runCloseCleanup, 350);
      return () => clearTimeout(closeTimerRef.current);
    }
  }, [isOpen, runCloseCleanup]);

  // Panel ratio — initialized from localStorage
  const [panelRatio, setPanelRatio] = useState(() =>
    loadPersistedRatio(storageKey, minRatio, maxRatio, defaultRatio),
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startRatio: 0 });

  // Ref to clean up drag listeners if the component unmounts mid-drag
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // Keep a ref to panelRatio so the drag handler always reads the latest value
  const panelRatioRef = useRef(panelRatio);
  panelRatioRef.current = panelRatio;

  // Escape key: exit fullscreen first, then close panel
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (isFullscreen) {
        toggleFullscreen();
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, isFullscreen, onClose, toggleFullscreen]);

  // Persist ratio on change (but not during drag — too frequent)
  const persistOnDragEnd = useCallback(
    (ratio: number) => {
      setPanelRatio(ratio);
      persistRatio(storageKey, ratio);
    },
    [storageKey],
  );

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
        const clamped = Math.max(minRatio, Math.min(maxRatio, newRatio));
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
        if (finalRatio > fullscreenSnapRatio) {
          setFullscreen(true);
        } else {
          const clamped = Math.max(minRatio, Math.min(maxRatio, finalRatio));
          persistOnDragEnd(clamped);
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      dragCleanupRef.current = cleanup;
    },
    [containerRef, minRatio, maxRatio, fullscreenSnapRatio, setFullscreen, persistOnDragEnd],
  );

  // On mobile, render as a fixed overlay
  if (isMobile && isOpen) {
    return (
      <div className="fixed inset-0 z-40 bg-background">
        {children}
      </div>
    );
  }

  // Compute flex-basis for smooth transitions between states
  let flexBasis: string;
  if (!isOpen) {
    flexBasis = "0%";
  } else if (isFullscreen) {
    flexBasis = "100%";
  } else {
    flexBasis = `${panelRatio * 100}%`;
  }

  return (
    <>
      {/* Drag handle — only visible when panel is open and not fullscreen */}
      {isOpen && !isFullscreen && !isMobile && (
        <div
          onMouseDown={onDragStart}
          className={cn(
            "flex-none w-1 cursor-col-resize rounded-full hover:bg-border active:bg-accent",
            isDragging ? "bg-accent" : "bg-transparent",
          )}
        />
      )}

      <div
        ref={panelRef}
        className={cn(
          "min-w-0 overflow-hidden rounded-tl-lg rounded-tr-lg bg-background",
          isDragging ? "" : PANEL_TRANSITION,
          isOpen ? "border" : "border-transparent",
        )}
        style={{ flexBasis, flexGrow: isFullscreen ? 1 : 0, flexShrink: 0 }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "flex-basis" && !isOpen && e.target === panelRef.current) {
            runCloseCleanup();
          }
        }}
      >
        {showContent && (
          <div className="h-full min-w-[400px]">
            {children}
          </div>
        )}
      </div>
    </>
  );
}
