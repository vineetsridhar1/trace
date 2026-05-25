import { useEffect, useRef } from "react";
import { recreateClient } from "../lib/urql";
import { useUIStore } from "../stores/ui";
import {
  canRestartAfterWake,
  getResumeAction,
  LAST_WAKE_RESTART_KEY,
  RESUME_CHECK_INTERVAL_MS,
  WAKE_RESTART_DELAY_MS,
} from "./visibilityRefreshPolicy";

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

    function scheduleWakeRestart() {
      if (restartTimer.current) return;

      restartTimer.current = setTimeout(() => {
        restartTimer.current = null;
        if (document.hidden) return;

        const now = Date.now();
        if (!canRestartAfterWake(now, sessionStorage)) return;

        sessionStorage.setItem(LAST_WAKE_RESTART_KEY, String(now));
        recreateClient();
        triggerRefresh();
      }, WAKE_RESTART_DELAY_MS);
    }

    function handleSleepResume(duration: number) {
      const action = getResumeAction(duration);
      if (action === "none") return;
      triggerRefresh();
      if (action === "refresh-and-restart") scheduleWakeRestart();
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
        handleSleepResume(hiddenDuration);
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
