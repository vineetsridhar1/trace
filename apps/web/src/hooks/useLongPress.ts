import { useEffect, useRef, type RefObject } from "react";

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

/**
 * Attaches a touch-only long-press listener to an element.
 * Fires `onLongPress` with the AG Grid row-id after holding for 500ms.
 * Cancelled by scrolling/moving >10px or lifting the finger.
 * Returns a ref for whether the long-press fired (to suppress click-through).
 */
export function useLongPress({
  ref,
  onLongPress,
  rowSelector = "[row-id]",
  groupPrefix = "row-group-",
  disabled = false,
}: {
  ref: RefObject<HTMLElement | null>;
  onLongPress: (rowId: string) => void;
  rowSelector?: string;
  groupPrefix?: string;
  disabled?: boolean;
}) {
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    const clear = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startRef.current = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rowEl = (e.target as HTMLElement).closest<HTMLElement>(rowSelector);
      if (!rowEl) return;
      const rowId = rowEl.getAttribute("row-id");
      if (!rowId || rowId.startsWith(groupPrefix)) return;

      startRef.current = { x: touch.clientX, y: touch.clientY };
      firedRef.current = false;

      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        window.getSelection()?.removeAllRanges();
        navigator.vibrate?.(10);
        onLongPress(rowId);
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!timerRef.current || !startRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
        clear();
      }
    };

    const onContextMenu = (e: Event) => {
      if (firedRef.current) {
        e.preventDefault();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", clear);
    el.addEventListener("touchcancel", clear);
    el.addEventListener("contextmenu", onContextMenu);

    return () => {
      clear();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", clear);
      el.removeEventListener("touchcancel", clear);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [ref, onLongPress, rowSelector, groupPrefix, disabled]);

  return firedRef;
}
