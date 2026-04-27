import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { type Href, useRouter } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import {
  consumePendingDeepLinkPath,
  getPendingDeepLinkPath,
  setPendingDeepLinkPath,
} from "@/lib/deep-link-intent";
import { deepLinkFromNotificationData, routePathFromNotificationLink } from "@/lib/notification-deeplink";

async function clearLastNotificationResponse(): Promise<void> {
  await Notifications.clearLastNotificationResponseAsync?.();
}

export function useNotificationNavigation(): void {
  const router = useRouter();
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const loading = useAuthStore((s: AuthState) => s.loading);
  const lastHandledNotificationId = useRef<string | null>(null);

  useEffect(() => {
    const handlePath = async (path: string): Promise<void> => {
      if (loading || !user || !activeOrgId) {
        setPendingDeepLinkPath(path);
        return;
      }
      router.push(path as Href);
    };

    const handleResponse = async (
      response: Notifications.NotificationResponse | null,
      { clearLastResponse }: { clearLastResponse: boolean },
    ): Promise<void> => {
      if (!response) return;
      const requestId = response.notification.request.identifier;
      if (lastHandledNotificationId.current === requestId) {
        if (clearLastResponse) await clearLastNotificationResponse();
        return;
      }

      lastHandledNotificationId.current = requestId;
      const deepLink = deepLinkFromNotificationData(response.notification.request.content.data);
      const path = deepLink ? routePathFromNotificationLink(deepLink) : null;
      if (path) {
        await handlePath(path);
      }
      if (clearLastResponse) await clearLastNotificationResponse();
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => handleResponse(response, { clearLastResponse: true }))
      .catch((err: unknown) => {
        console.warn("[notifications] last response lookup failed", err);
      });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response, { clearLastResponse: true }).catch((err: unknown) => {
        console.warn("[notifications] response handling failed", err);
      });
    });
    return () => sub.remove();
  }, [activeOrgId, loading, router, user]);

  useEffect(() => {
    if (loading || !user || !activeOrgId) return;
    const pendingPath = getPendingDeepLinkPath();
    if (!pendingPath) return;
    router.push((consumePendingDeepLinkPath() ?? pendingPath) as Href);
  }, [activeOrgId, loading, router, user]);
}
