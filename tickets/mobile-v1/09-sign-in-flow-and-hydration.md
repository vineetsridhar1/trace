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
  - On success, parse `token` from returned URL, call `signInWithToken(token)` (from client-core), then `fetchMe()`.
  - Error state shown inline if auth fails.
- **Post-auth hydration** (`apps/mobile/src/hooks/useHydrate.ts`, <200 lines):
  - On auth becoming true and active org set, fire:
    - `organization(activeOrgId)` query to hydrate channels/channel groups
    - `mySessions(activeOrgId)` to seed session list
  - Upsert results into the entity store.
  - Subscribe to `orgEvents(activeOrgId)` (ambient) — stays subscribed for session duration.
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

- [ ] Cold-launching the app with no token lands on sign-in
- [ ] Completing GitHub OAuth returns to the app, stores token, shows authed shell
- [ ] Sign-in screen includes working Terms + Privacy footer links
- [ ] Entity store is hydrated with channels + sessions after auth
- [ ] Ambient `orgEvents` subscription is active
- [ ] Org switcher changes active org, rebuilds the client, rehydrates, and resubscribes
- [ ] Sign-out clears state and returns to sign-in
- [ ] 401 from any GraphQL operation clears auth and returns to sign-in
- [ ] All files <200 lines

## How to test

1. Fresh install → sign-in screen.
2. Tap GitHub → OAuth in-app browser → approve → redirects back → lands on authed tabs (placeholder until M3).
3. Kill and relaunch → session persists, skips sign-in.
4. Tap Terms / Privacy → Safari opens the correct URLs and returning to the app preserves auth state.
5. Switch org via settings → tab content reflects new org and subsequent queries/subscriptions use the new org header.
6. Force a 401 from an authed query or mutation → app clears auth and returns to sign-in.
7. Sign out → back to sign-in; token removed from Keychain (verify via Xcode device console).
