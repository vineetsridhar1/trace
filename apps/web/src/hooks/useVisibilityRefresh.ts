import { useEffect, useRef } from "react";
import { useConnectionStore } from "../stores/connection";
import { useUIStore } from "../stores/ui";

const HIDDEN_THRESHOLD_MS = 5_000;
const DISCONNECTED_RELOAD_DELAY_MS = 2_000;
const RELOAD_COOLDOWN_MS = 30_000;
const LAST_WAKE_RELOAD_KEY = "trace:last-wake-reload-at";

function canReloadAfterWake(now: number): boolean {
  const lastReloadAt = Number(sessionStorage.getItem(LAST_WAKE_RELOAD_KEY) ?? "0");
  return !Number.isFinite(lastReloadAt) || now - lastReloadAt > RELOAD_COOLDOWN_MS;
}

export function useVisibilityRefresh() {
  const triggerRefresh = useUIStore((s: { triggerRefresh: () => void }) => s.triggerRefresh);
  const hiddenAt = useRef<number | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearReloadTimer() {
      if (!reloadTimer.current) return;
      clearTimeout(reloadTimer.current);
      reloadTimer.current = null;
    }

    function scheduleDisconnectedReload() {
      if (reloadTimer.current || useConnectionStore.getState().connected) return;

      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        if (document.hidden || useConnectionStore.getState().connected) return;

        const now = Date.now();
        if (!canReloadAfterWake(now)) return;

        sessionStorage.setItem(LAST_WAKE_RELOAD_KEY, String(now));
        window.location.reload();
      }, DISCONNECTED_RELOAD_DELAY_MS);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        clearReloadTimer();
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > HIDDEN_THRESHOLD_MS) {
        triggerRefresh();
        scheduleDisconnectedReload();
        hiddenAt.current = null;
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearReloadTimer();
    };
  }, [triggerRefresh]);
}
