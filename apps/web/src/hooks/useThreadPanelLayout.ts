import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

const DEFAULT_THREAD_WIDTH = 320;
const MIN_THREAD_WIDTH = 260;
const MAX_THREAD_WIDTH = 600;

function getStoredWidth(storageKey: string): number {
  const stored = localStorage.getItem(storageKey);
  if (!stored) {
    return DEFAULT_THREAD_WIDTH;
  }

  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed)
    ? Math.min(MAX_THREAD_WIDTH, Math.max(MIN_THREAD_WIDTH, parsed))
    : DEFAULT_THREAD_WIDTH;
}

export function useThreadPanelLayout(activeThreadId: string | null, storageKey: string) {
  const lastThreadId = useRef(activeThreadId);
  const [rendered, setRendered] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const [threadWidth, setThreadWidth] = useState(() => getStoredWidth(storageKey));
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (activeThreadId) {
      lastThreadId.current = activeThreadId;
      setRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideIn(true));
      });
      return;
    }

    setSlideIn(false);
    const timer = setTimeout(() => setRendered(false), 200);
    return () => clearTimeout(timer);
  }, [activeThreadId]);

  const handleDragStart = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
    const startX = event.clientX;
    const startWidth = threadWidth;

    const onMouseMove = (nextEvent: MouseEvent) => {
      const delta = startX - nextEvent.clientX;
      const nextWidth = Math.min(MAX_THREAD_WIDTH, Math.max(MIN_THREAD_WIDTH, startWidth + delta));
      setThreadWidth(nextWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      setThreadWidth((width) => {
        localStorage.setItem(storageKey, String(width));
        return width;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [storageKey, threadWidth]);

  return {
    threadId: activeThreadId ?? lastThreadId.current,
    rendered,
    slideIn,
    threadWidth,
    isDragging,
    handleDragStart,
  };
}
