import { useEffect, useRef } from "react";
import { recreateClient } from "../lib/urql";
import { useConnectionStore } from "../stores/connection";
import { useUIStore } from "../stores/ui";

const HIDDEN_THRESHOLD_MS = 5_000;
// Treat only long event-loop/visibility gaps as sleep, not routine app switching.
const SLEEP_RESUME_THRESHOLD_MS = 30 * 60 * 1_000;
const RESUME_CHECK_INTERVAL_MS = 10_000;
const DISCONNECTED_RESTART_DELAY_MS = 2_000;
const RESTART_COOLDOWN_MS = 30_000;
const LAST_WAKE_RESTART_KEY = "trace:last-wake-transport-restart-at";

function canRestartAfterWake(now: number): boolean {
  const lastRestartAt = Number(sessionStorage.getItem(LAST_WAKE_RESTART_KEY) ?? "0");
  return !Number.isFinite(lastRestartAt) || now - lastRestartAt > RESTART_COOLDOWN_MS;
}

export function useVisibilityRefresh() {
  const triggerRefresh = useUIStore((s: { triggerRefresh: () => void }) => s.triggerRefresh);
  const hiddenAt = useRef<number | null>(null);
  const lastResumeCheckAt = useRef(Date.now());
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearRestartTimer() {
      if (!restartTimer.current) return;
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }

    function scheduleDisconnectedRestart() {
      if (restartTimer.current || useConnectionStore.getState().connected) return;

      restartTimer.current = setTimeout(() => {
        restartTimer.current = null;
        if (document.hidden || useConnectionStore.getState().connected) return;

        const now = Date.now();
        if (!canRestartAfterWake(now)) return;

        sessionStorage.setItem(LAST_WAKE_RESTART_KEY, String(now));
        recreateClient();
        triggerRefresh();
      }, DISCONNECTED_RESTART_DELAY_MS);
    }

    function handleSleepResume(duration: number) {
      if (duration <= SLEEP_RESUME_THRESHOLD_MS) return;
      triggerRefresh();
      scheduleDisconnectedRestart();
    }

    function checkResumeClock() {
      const now = Date.now();
      const elapsed = now - lastResumeCheckAt.current;
      lastResumeCheckAt.current = now;
      handleSleepResume(elapsed);
    }

    function handleVisibilityChange() {
      const now = Date.now();
      if (document.hidden) {
        clearRestartTimer();
        hiddenAt.current = now;
        lastResumeCheckAt.current = now;
      } else if (hiddenAt.current) {
        const hiddenDuration = now - hiddenAt.current;
        lastResumeCheckAt.current = now;
        if (hiddenDuration > SLEEP_RESUME_THRESHOLD_MS) {
          handleSleepResume(hiddenDuration);
        } else if (hiddenDuration > HIDDEN_THRESHOLD_MS) {
          triggerRefresh();
        }
        hiddenAt.current = null;
      } else {
        checkResumeClock();
      }
    }

    const resumeCheckInterval = setInterval(checkResumeClock, RESUME_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", checkResumeClock);
    window.addEventListener("online", checkResumeClock);
    window.addEventListener("pageshow", checkResumeClock);

    return () => {
      clearInterval(resumeCheckInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", checkResumeClock);
      window.removeEventListener("online", checkResumeClock);
      window.removeEventListener("pageshow", checkResumeClock);
      clearRestartTimer();
    };
  }, [triggerRefresh]);
}
