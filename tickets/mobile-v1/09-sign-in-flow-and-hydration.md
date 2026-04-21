# 09 — Sign-in Flow, Hydration, and Org Switcher

## Summary

Wire up the end-to-end authentication experience on mobile: a sign-in screen that launches GitHub OAuth via `ASWebAuthenticationSession`, receives the token via the custom scheme, stores it in Keychain, hydrates the entity store with `me` + `mySessions` + channels, and lets the user switch active orgs. This ticket delivers a signed-in, hydrated app shell ready for screens to layer on.

## What needs to happen

- **Auth gate in `app/_layout.tsx`:**
  - Read token via `Platform.secureStorage.getToken()`.
  - If token present: call `fetchMe()`, render `(authed)` group.
  - If missing or `fetchMe` returns 401: render `(auth)/sign-in`.
  - Show splash / spinner during the determination.
  - Any later 401 from a query, mutation, or subscription auth refresh path clears auth state, clears Keychain, and routes back to sign-in.
- **Sign-in screen** (`app/(auth)/sign-in.tsx`, <200 lines):
  - Trace wordmark + "Continue with GitHub" button (uses `Button` primitive once M2 lands; placeholder until then).
  - Tiny footer links for Terms and Privacy that open the existing web URLs in Safari.
  - On press: `WebBrowser.openAuthSessionAsync(\`${API_URL}/auth/github?origin=trace-mobile\`, 'trace://auth/callback')`.
  - On success, parse `token` from returned URL and call `signInWithToken(token)` (from client-core). `signInWithToken` persists the token via `Platform.secureStorage` and runs `fetchMe()` itself — do not chain a second `fetchMe`.
  - Error state shown inline if auth fails.
- **Org-event UI bindings** (must run **before** any `orgEvents` subscription opens, e.g. in `apps/mobile/src/lib/event-bindings.ts` imported from `app/_layout.tsx` after the platform adapter):
  - Call `setOrgEventUIBindings(...)` from `@trace/client-core` with mobile impls of `getActive*Id`, `setActive*Id`, `mark*Done`, `openSessionTab` (no-op on mobile), and `navigateToSession` (delegates to the expo-router `router.push("/sessions/${groupId}/${sessionId}")`).
  - Without this, the shared `handleOrgEvent` will silently skip badge marks, continuation-session navigation, and post-deletion redirects (see mobile-plan.md §13.2).
- **GraphQL client construction** (`apps/mobile/src/lib/urql.ts`):
  - Use `createGqlClient({ httpUrl, wsUrl, onConnectionChange })` from `@trace/client-core`. Wire `onConnectionChange` to the mobile equivalent of `useConnectionStore` if/when one exists.
  - On org switch, dispose and recreate the client so the WS handshake picks up the new `X-Organization-Id` and the entity store is rebuilt cleanly.
- **Post-auth hydration** (`apps/mobile/src/hooks/useHydrate.ts`, <200 lines):
  - On auth becoming true and active org set, fire:
    - `organization(activeOrgId)` query to hydrate channels/channel groups
    - `mySessions(activeOrgId)` to seed session list
  - Upsert results into the entity store.
  - Subscribe to `orgEvents(activeOrgId)` (ambient) using `client.subscription(...).subscribe(({ data }) => handleOrgEvent(data.orgEvents))` — keep the hook a thin wrapper around `handleOrgEvent` from `@trace/client-core`. Stays subscribed for session duration.
- **Org switcher sheet** (`apps/mobile/src/components/auth/OrgSwitcherSheet.tsx`, <200 lines):
  - Native iOS sheet with medium detent.
  - Lists `orgMemberships` from auth store.
  - Current active org checkmarked.
  - On select: `setActiveOrg(id)`, tear down focused + ambient subscriptions, rebuild the urql client with the new `X-Organization-Id` header, then re-hydrate and re-subscribe.
- **Sign-out:** clear Keychain token, clear entity store, navigate to `/(auth)/sign-in`.
- **App-foreground refresh:** when the app returns to foreground and last-me-fetch was >24h ago, re-fetch `/auth/me`.

## Dependencies

- [06 — Mobile Platform Adapter](06-mobile-platform-adapter.md)
- [07 — Server: Mobile OAuth Scheme](07-server-oauth-mobile-scheme.md)

## Completion requirements

- [x] Cold-launching the app with no token lands on sign-in
- [x] Completing GitHub OAuth returns to the app, stores token, shows authed shell
- [x] Sign-in screen includes working Terms + Privacy footer links
- [x] urql client built via `createGqlClient` from `@trace/client-core`
- [x] `setOrgEventUIBindings(...)` is called at boot before any subscription opens
- [x] Entity store is hydrated with channels + channel groups + sessions after auth
- [x] Ambient `orgEvents` subscription is active and routes events through `handleOrgEvent`
- [x] Org switcher changes active org, rebuilds the client, rehydrates, and resubscribes
- [x] Sign-out clears state and returns to sign-in
- [x] 401 from any GraphQL operation clears auth and returns to sign-in
- [x] All files <200 lines

## Implementation notes

- `setPlatform()` runs from a custom `apps/mobile/index.js` entry that is loaded before `expo-router/entry`. Expo Router calls `loadRoute()` on every layout during route-tree construction, so the platform adapter must be registered before any route module is evaluated; relying on a side-effect import in `app/_layout.tsx` alone is not enough.
- The urql client is lazy-built on first `getClient()` so the adapter is guaranteed to be present.
- `Organization.channelGroups` is **not** in the GraphQL schema, so hydration fires three parallel queries (`organization`, `channelGroups`, `mySessions`) instead of the one query the original ticket text implied. See plan §12.1 for the updated sequence.
- The org switcher sheet at `apps/mobile/src/components/auth/OrgSwitcherSheet.tsx` uses a plain `Modal` with `pageSheet` presentation. It is functional but does not yet honour the medium detent; ticket 18 (Settings + Org Switcher) is responsible for replacing it with the proper `Sheet` primitive once M2 design-system tickets land.
- `recreateClient()` drops the urql client reference; the underlying `graphql-ws` socket is not explicitly disposed and relies on GC to close. Acceptable for V1 with infrequent org switching; revisit if it shows up in profiling.

## How to test

1. Fresh install → sign-in screen.
2. Tap GitHub → OAuth in-app browser → approve → redirects back → lands on authed tabs (placeholder until M3).
3. Kill and relaunch → session persists, skips sign-in.
4. Tap Terms / Privacy → Safari opens the correct URLs and returning to the app preserves auth state.
5. Switch org via settings → tab content reflects new org and subsequent queries/subscriptions use the new org header.
6. Force a 401 from an authed query or mutation → app clears auth and returns to sign-in.
7. Sign out → back to sign-in; token removed from Keychain (verify via Xcode device console).
