import { useEffect, useRef, useState, type RefObject } from "react";
import { useAnimationControls } from "framer-motion";
import { COMPACT_BREAKPOINT } from "./sessions-table-types";

export function useCompactTableMode(containerRef: RefObject<HTMLDivElement | null>) {
  const hasMeasuredRef = useRef(false);
  const hasAnimatedModeRef = useRef(false);
  const [isCompact, setIsCompact] = useState(false);
  const fadeControls = useAnimationControls();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateCompact = (width: number) => {
      setIsCompact(width < COMPACT_BREAKPOINT);
      if (!hasMeasuredRef.current) {
        hasMeasuredRef.current = true;
        fadeControls.set({ opacity: 1 });
      }
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateCompact(entry.contentRect.width);
      }
    });

    observer.observe(el);
    updateCompact(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [containerRef, fadeControls]);

  useEffect(() => {
    if (!hasMeasuredRef.current) return;
    if (!hasAnimatedModeRef.current) {
      hasAnimatedModeRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      fadeControls.set({ opacity: 0 });
      await fadeControls.start({ opacity: 1, transition: { duration: 0.12 } });
    })();

    return () => {
      cancelled = true;
    };
  }, [fadeControls, isCompact]);

  return { fadeControls, isCompact };
}
