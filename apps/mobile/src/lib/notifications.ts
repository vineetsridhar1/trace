import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { type Href, useRouter } from "expo-router";
import {
  REGISTER_PUSH_TOKEN_MUTATION,
  UNREGISTER_PUSH_TOKEN_MUTATION,
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
} from "@trace/client-core";
import { deepLinkFromNotificationData, routePathFromNotificationLink } from "@/lib/notification-deeplink";
import {
  clearPushRegistration,
  readPushRegistration,
  writePushRegistration,
} from "@/lib/notification-registration";
import { getClient } from "@/lib/urql";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

function selectNeedsInputCount(state: EntityState): number {
  let count = 0;
  for (const id in state.sessions) {
    if (state.sessions[id].sessionStatus === "needs_input") count++;
  }
  return count;
}

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: unknown } }
    | undefined;
  const configured =
    extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return typeof configured === "string" && configured.length > 0 ? configured : null;
}

const pushPlatform = (): "ios" | "android" => (Platform.OS === "android" ? "android" : "ios");

export async function ensureRegistered(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  const { activeOrgId, user } = useAuthStore.getState();
  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status === "undetermined") {
    permissions = await Notifications.requestPermissionsAsync();
  }
  if (permissions.status !== "granted") return;

  const id = projectId();
  if (!id) {
    console.warn("[notifications] missing EAS project id; skipping push registration");
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  const previous = await readPushRegistration();
  if (previous?.token === token && previous.userId === user?.id && previous.organizationId === activeOrgId) {
    return;
  }

  const result = await getClient()
    .mutation(REGISTER_PUSH_TOKEN_MUTATION, { token, platform: pushPlatform() })
    .toPromise();
  if (result.error) throw result.error;
  await writePushRegistration({ token, userId: user?.id ?? null, organizationId: activeOrgId });
}

export async function unregister(): Promise<void> {
  const registration = await readPushRegistration();
  if (!registration) {
    await Notifications.setBadgeCountAsync(0);
    return;
  }
  const result = await getClient()
    .mutation(UNREGISTER_PUSH_TOKEN_MUTATION, { token: registration.token })
    .toPromise();
  if (result.error) throw result.error;
  await Promise.all([clearPushRegistration(), Notifications.setBadgeCountAsync(0)]);
}

export async function clearLocalNotificationState(): Promise<void> {
  await Promise.all([clearPushRegistration(), Notifications.setBadgeCountAsync(0)]);
}

export function useRegisterPushToken(): void {
  const router = useRouter();
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const needsInputCount = useEntityStore(selectNeedsInputCount);
  const previousAuthed = useRef(false);
  const previousOrgId = useRef<string | null>(null);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = deepLinkFromNotificationData(response.notification.request.content.data);
      const path = deepLink ? routePathFromNotificationLink(deepLink) : null;
      if (path) router.push(path as Href);
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    const authed = Boolean(user && activeOrgId);
    if (authed && !previousAuthed.current) {
      void ensureRegistered().catch((err: unknown) => {
        console.warn("[notifications] push registration failed", err);
      });
    } else if (!authed && previousAuthed.current) {
      void unregister().catch((err: unknown) => {
        console.warn("[notifications] push unregister failed", err);
      });
    } else if (authed && previousOrgId.current && previousOrgId.current !== activeOrgId) {
      void unregister()
        .catch((err: unknown) => {
          console.warn("[notifications] push unregister during org switch failed", err);
        })
        .then(ensureRegistered)
        .catch((err: unknown) => {
          console.warn("[notifications] push org switch registration failed", err);
        });
    }
    previousAuthed.current = authed;
    previousOrgId.current = activeOrgId;
  }, [user, activeOrgId]);

  useEffect(() => {
    void Notifications.setBadgeCountAsync(needsInputCount);
  }, [needsInputCount]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void Notifications.setBadgeCountAsync(needsInputCount);
    });
    return () => sub.remove();
  }, [needsInputCount]);
}
