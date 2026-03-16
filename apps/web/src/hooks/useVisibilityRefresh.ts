import { useEffect, useRef } from "react";
import { useUIStore } from "../stores/ui";

const HIDDEN_THRESHOLD_MS = 5_000;

export function useVisibilityRefresh() {
  const triggerRefresh = useUIStore((s) => s.triggerRefresh);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > HIDDEN_THRESHOLD_MS) {
        triggerRefresh();
        hiddenAt.current = null;
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [triggerRefresh]);
}
