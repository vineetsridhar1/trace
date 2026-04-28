import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { type Href, usePathname, useRouter } from "expo-router";
import { useAuthStore, type AuthState } from "@trace/client-core";
import {
  consumePendingDeepLinkPath,
  getPendingDeepLinkPath,
  setPendingDeepLinkPath,
} from "@/lib/deep-link-intent";
import {
  deepLinkFromNotificationData,
  routePathFromNotificationLink,
  shouldNavigateToNotificationPath,
} from "@/lib/notification-deeplink";

function bridgeAccessRequestIdFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const requestId = (data as Record<string, unknown>).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : null;
}

async function clearLastNotificationResponse(): Promise<void> {
  await Notifications.clearLastNotificationResponseAsync?.();
}

export function useNotificationNavigation(): void {
  const router = useRouter();
  const pathname = usePathname();
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
      if (!shouldNavigateToNotificationPath(pathname, path)) return;
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
      const data = response.notification.request.content.data;
      const deepLink = deepLinkFromNotificationData(data);
      let path = deepLink ? routePathFromNotificationLink(deepLink) : null;
      const bridgeAccessRequestId = bridgeAccessRequestIdFromNotificationData(data);
      if (path === "/(connections)" && bridgeAccessRequestId) {
        path = `/(connections)?requestId=${encodeURIComponent(bridgeAccessRequestId)}`;
      }
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
  }, [activeOrgId, loading, pathname, router, user]);

  useEffect(() => {
    if (loading || !user || !activeOrgId) return;
    const pendingPath = getPendingDeepLinkPath();
    if (!pendingPath) return;
    const path = consumePendingDeepLinkPath() ?? pendingPath;
    if (!shouldNavigateToNotificationPath(pathname, path)) return;
    router.push(path as Href);
  }, [activeOrgId, loading, pathname, router, user]);
}
