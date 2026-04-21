import { useEffect } from "react";
import {
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
  type SessionEntity,
} from "@trace/client-core";
import {
  ensureRegistered,
  installNotificationResponseListener,
  setBadge,
  unregister,
} from "@/lib/notifications";

function selectNeedsInputCount(state: EntityState, userId: string | null): number {
  if (!userId) return 0;
  let count = 0;
  for (const id in state.sessions) {
    const session = state.sessions[id] as SessionEntity;
    if (session.sessionStatus !== "needs_input") continue;
    const createdBy = session.createdBy as { id?: string } | undefined | null;
    if (createdBy?.id !== userId) continue;
    count += 1;
  }
  return count;
}

/**
 * Drives push-notification registration off the current auth + active-org
 * state. Tokens are scoped per user+org, so changing either tears down the
 * previous registration before requesting a new one. Also keeps the iOS app
 * badge in sync with the count of `needs_input` sessions belonging to the
 * signed-in user, and installs the deep-link tap handler once.
 */
export function useRegisterPushToken(): void {
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);

  useEffect(() => {
    installNotificationResponseListener();
  }, []);

  useEffect(() => {
    if (!userId || !activeOrgId) return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureRegistered();
      } catch (err) {
        if (cancelled) return;
        console.warn("[notifications] ensureRegistered failed", err);
      }
    })();
    return () => {
      cancelled = true;
      void unregister();
    };
  }, [userId, activeOrgId]);

  const needsInput = useEntityStore((s) => selectNeedsInputCount(s, userId));
  useEffect(() => {
    void setBadge(needsInput);
  }, [needsInput]);
}
