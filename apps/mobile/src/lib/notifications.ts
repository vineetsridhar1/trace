import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import {
  getPlatform,
  REGISTER_PUSH_TOKEN_MUTATION,
  UNREGISTER_PUSH_TOKEN_MUTATION,
} from "@trace/client-core";
import type { PushPlatform } from "@trace/gql";
import { getClient } from "@/lib/urql";

const LAST_TOKEN_KEY = "trace_push_token";

// Foreground policy (per ticket 26): the live subscription already updates the
// UI when an event arrives, so a banner would be a visible duplicate. Badge is
// the only thing the user can't see by glancing at the open screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

let responseListener: { remove: () => void } | null = null;

export function installNotificationResponseListener(): void {
  if (responseListener) return;
  responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | { deepLink?: unknown }
        | null
        | undefined;
      const deepLink = typeof data?.deepLink === "string" ? data.deepLink : null;
      if (!deepLink) return;
      // expo-router accepts external `<scheme>://<path>` hrefs; cast satisfies
      // the typed-routes signature without baking deep-link shapes into types.
      router.push(deepLink as never);
    },
  );
}

function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: unknown } }
    | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function currentPlatform(): PushPlatform | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

async function readLastToken(): Promise<string | null> {
  const value = await getPlatform().storage.getItem(LAST_TOKEN_KEY);
  return value ?? null;
}

async function writeLastToken(token: string | null): Promise<void> {
  if (token) await getPlatform().storage.setItem(LAST_TOKEN_KEY, token);
  else await getPlatform().storage.removeItem(LAST_TOKEN_KEY);
}

/**
 * Request permissions if undetermined, fetch the Expo push token, register
 * with the server, and persist the token so we can detect changes on relaunch
 * and unregister on sign-out / org switch. No-ops on platforms or builds
 * without an EAS projectId (Expo push requires one).
 */
export async function ensureRegistered(): Promise<void> {
  const platform = currentPlatform();
  if (!platform) return;

  const projectId = getProjectId();
  if (!projectId) {
    if (__DEV__) {
      console.warn(
        "[notifications] No EAS projectId — skipping push registration. Configure expo.extra.eas.projectId.",
      );
    }
    return;
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) return;

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResult.data;
  if (!token) return;

  const result = await getClient()
    .mutation(REGISTER_PUSH_TOKEN_MUTATION, { token, platform })
    .toPromise();
  if (result.error) {
    console.warn("[notifications] register failed", result.error.message);
    return;
  }
  await writeLastToken(token);
}

/**
 * Unregister the most recently stored token with the server and clear local
 * state. Safe to call even when no token was previously registered.
 */
export async function unregister(): Promise<void> {
  const token = await readLastToken();
  if (!token) return;
  await writeLastToken(null);
  const result = await getClient()
    .mutation(UNREGISTER_PUSH_TOKEN_MUTATION, { token })
    .toPromise();
  if (result.error) {
    console.warn("[notifications] unregister failed", result.error.message);
  }
}

export async function setBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch (err) {
    if (__DEV__) console.warn("[notifications] setBadge failed", err);
  }
}
