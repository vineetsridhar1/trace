import { useEffect, useRef } from "react";
import { useAuthStore, type AuthState } from "@trace/client-core";

const AUTH_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Renews active browser sessions and detects expiry after a long sleep without
 * treating ordinary network outages as a logout.
 */
export function useAuthSessionRefresh() {
  const userId = useAuthStore((state: AuthState) => state.user?.id);
  const fetchMe = useAuthStore((state: AuthState) => state.fetchMe);
  const reauthRequired = useAuthStore((state: AuthState) => state.reauthRequired);
  const lastCheckedAt = useRef(Date.now());
  const checking = useRef(false);

  useEffect(() => {
    if (!userId) return;

    async function checkSession() {
      if (checking.current || reauthRequired) return;
      checking.current = true;
      lastCheckedAt.current = Date.now();
      try {
        await fetchMe();
      } finally {
        checking.current = false;
      }
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void checkSession();
      }
    }, AUTH_CHECK_INTERVAL_MS);

    function handleVisibilityChange() {
      if (!document.hidden && Date.now() - lastCheckedAt.current >= AUTH_CHECK_INTERVAL_MS) {
        void checkSession();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchMe, reauthRequired, userId]);
}
