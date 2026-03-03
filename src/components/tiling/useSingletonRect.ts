import { useState, useLayoutEffect, type RefObject } from 'react';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const ZERO_RECT: Rect = { top: 0, left: 0, width: 0, height: 0 };

export function useSingletonRect(
  claimRef: RefObject<HTMLDivElement | null> | null,
  containerRef: RefObject<HTMLDivElement | null>,
): Rect {
  const [rect, setRect] = useState<Rect>(ZERO_RECT);

  useLayoutEffect(() => {
    const claim = claimRef?.current;
    const container = containerRef.current;
    if (!claim || !container) {
      setRect(ZERO_RECT);
      return;
    }

    const update = () => {
      const cR = container.getBoundingClientRect();
      const pR = claim.getBoundingClientRect();
      setRect({
        top: pR.top - cR.top,
        left: pR.left - cR.left,
        width: pR.width,
        height: pR.height,
      });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(claim);
    observer.observe(container);
    return () => observer.disconnect();
  }, [claimRef, containerRef]);

  return rect;
}
