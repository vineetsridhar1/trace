import { useEffect, useRef, type RefObject } from "react";

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

/**
 * Generic touch-only long-press hook.
 * Fires `onLongPress` after holding for 500ms without moving.
 * Clears text selection and prevents native context menu on fire.
 * Returns a ref indicating whether the long-press fired (to suppress click-through).
 */
export function useLongPressEvent({
  ref,
  onLongPress,
  disabled = false,
}: {
  ref: RefObject<HTMLElement | null>;
  onLongPress: () => void;
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

      startRef.current = { x: touch.clientX, y: touch.clientY };
      firedRef.current = false;

      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        window.getSelection()?.removeAllRanges();
        navigator.vibrate?.(10);
        onLongPress();
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
  }, [ref, onLongPress, disabled]);

  return firedRef;
}
