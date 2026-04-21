# 26 — Push Notification Registration (Client)

## Summary

On first authenticated app launch (and on sign-in), request push notification permissions, obtain the Expo push token, and register it with the server via `registerPushToken`. On sign-out or org switch, unregister the old token. Foreground notifications are silenced (the live subscription already updates the UI).

## What needs to happen

- `apps/mobile/src/lib/notifications.ts` (<150 lines):
  - `async function ensureRegistered()`:
    - Check permissions; if undetermined, request.
    - If granted, fetch Expo push token: `await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId })`.
    - Call `registerPushToken(token, 'ios')` mutation.
    - Store last-registered token in MMKV so we can detect changes on relaunch.
  - `async function unregister()`:
    - Call `unregisterPushToken(lastToken)`.
    - Clear stored token.
- Hook `useRegisterPushToken()` used in root `_layout.tsx` after auth:
  - Calls `ensureRegistered()` on mount.
  - On sign-out (auth state transition true → false): `unregister()`.
  - On org switch: `unregister()` then `ensureRegistered()` (tokens are per user+org).
- Foreground behavior (`Notifications.setNotificationHandler`):
  - Return `{ shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: true }` when app is foregrounded — the UI already reflects state changes live, so suppressing banners prevents visual dupes. Badge still updates.
- Notification tap handler (`Notifications.addNotificationResponseReceivedListener`):
  - Read `data.deepLink` from the notification payload.
  - Use `router.push(deepLink)` to navigate.
- App badge update: when app is foregrounded, update badge from `Notifications.setBadgeCountAsync(count)` using the count of `needs_input` sessions (re-computed whenever that count changes).

## Dependencies

- [08 — Server Push Token Mutations](08-server-push-token-registration.md)
- [09 — Auth/Hydration](09-sign-in-flow-and-hydration.md)
- [15 — Navigation (for router.push)](15-navigation-tabs.md)
- Install: `expo-notifications`

## Completion requirements

- [x] Permission prompt appears once on first authed launch
- [x] Token registered with server on grant
- [x] Token unregistered on sign-out and re-registered after new sign-in
- [x] Foreground notifications do not show banners
- [x] Tapping a notification (with deep-link payload) routes to the correct screen
- [x] Badge count reflects needs-input count

## How to test

1. Fresh install → sign in → permission prompt → allow.
2. Check server DB: `push_tokens` row created for user + org.
3. Send a test push via Expo Push dashboard with `data.deepLink = trace://sessions/...` → banner appears when app backgrounded → tap → correct screen.
4. Foreground the app, trigger a push → no banner; subscription-driven UI update still happens.
5. Sign out → push_tokens row removed.
