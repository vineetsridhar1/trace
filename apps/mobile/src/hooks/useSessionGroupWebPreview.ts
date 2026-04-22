import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { SESSION_GROUP_WEB_PREVIEW_QUERY, useAuthStore, type AuthState } from "@trace/client-core";
import { getClient } from "@/lib/urql";
import type { ConnectionWebPreview } from "./useConnections";

type SessionGroupWebPreviewQueryResult = {
  sessionGroupWebPreview?: ConnectionWebPreview | null;
};

const POLL_INTERVAL_MS = 10_000;

export function useSessionGroupWebPreview(groupId: string | null | undefined): {
  preview: ConnectionWebPreview | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const userId = useAuthStore((state: AuthState) => state.user?.id);
  const activeOrgId = useAuthStore((state: AuthState) => state.activeOrgId);
  const [preview, setPreview] = useState<ConnectionWebPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(
    async (showLoading: boolean) => {
      if (!groupId || !userId || !activeOrgId) return;
      if (showLoading) setLoading(true);
      try {
        const result = await getClient()
          .query<SessionGroupWebPreviewQueryResult>(
            SESSION_GROUP_WEB_PREVIEW_QUERY,
            { sessionGroupId: groupId },
            { requestPolicy: "network-only" },
          )
          .toPromise();
        if (cancelledRef.current) return;
        if (result.error) {
          console.warn("[useSessionGroupWebPreview] query failed", result.error);
          return;
        }
        setPreview(result.data?.sessionGroupWebPreview ?? null);
      } finally {
        if (!cancelledRef.current && showLoading) setLoading(false);
      }
    },
    [activeOrgId, groupId, userId],
  );

  useEffect(() => {
    cancelledRef.current = false;
    if (!groupId || !userId || !activeOrgId) {
      setPreview(null);
      return () => {
        cancelledRef.current = true;
      };
    }

    void fetchOnce(true);
    const intervalId = setInterval(() => {
      if (AppState.currentState === "active") void fetchOnce(false);
    }, POLL_INTERVAL_MS);
    const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void fetchOnce(false);
    });

    return () => {
      cancelledRef.current = true;
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [activeOrgId, fetchOnce, groupId, userId]);

  return { preview, loading, refresh: useCallback(() => fetchOnce(false), [fetchOnce]) };
}
