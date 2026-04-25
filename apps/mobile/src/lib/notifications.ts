import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { type Href, useRouter } from "expo-router";
import {
  REGISTER_PUSH_TOKEN_MUTATION,
  UNREGISTER_PUSH_TOKEN_MUTATION,
  getPlatform,
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
} from "@trace/client-core";
import { getClient } from "@/lib/urql";

const LAST_PUSH_TOKEN_KEY = "trace_push_token";

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
  const configured = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof configured === "string" && configured.length > 0 ? configured : null;
}

function pushPlatform(): "ios" | "android" {
  return Platform.OS === "android" ? "android" : "ios";
}

async function lastToken(): Promise<string | null> {
  return getPlatform().storage.getItem(LAST_PUSH_TOKEN_KEY);
}

async function setLastToken(token: string): Promise<void> {
  await getPlatform().storage.setItem(LAST_PUSH_TOKEN_KEY, token);
}

async function clearLastToken(): Promise<void> {
  await getPlatform().storage.removeItem(LAST_PUSH_TOKEN_KEY);
}

export async function ensureRegistered(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
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
  const previous = await lastToken();
  if (previous === token) return;

  const result = await getClient()
    .mutation(REGISTER_PUSH_TOKEN_MUTATION, { token, platform: pushPlatform() })
    .toPromise();
  if (result.error) throw result.error;
  await setLastToken(token);
}

export async function unregister(): Promise<void> {
  const token = await lastToken();
  if (!token) return;
  const result = await getClient()
    .mutation(UNREGISTER_PUSH_TOKEN_MUTATION, { token })
    .toPromise();
  if (result.error) console.warn("[notifications] push unregister failed", result.error);
  await clearLastToken();
}

function deepLinkFromResponse(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data;
  if (!data || typeof data !== "object") return null;
  const deepLink = (data as Record<string, unknown>).deepLink;
  return typeof deepLink === "string" && deepLink.length > 0 ? deepLink : null;
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
      const deepLink = deepLinkFromResponse(response);
      if (deepLink) router.push(deepLink as Href);
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
      void unregister();
    } else if (authed && previousOrgId.current && previousOrgId.current !== activeOrgId) {
      void unregister().then(ensureRegistered).catch((err: unknown) => {
        console.warn("[notifications] push org switch failed", err);
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
