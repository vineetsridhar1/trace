# 28 — Deep Linking and Universal Links

## Summary

Wire up both the custom scheme (`trace://`) and Apple universal links (`https://example.com/m/...`) so that tapping notifications, pasted links, and web-to-mobile transitions all land on the correct screen with correct state. Expo Router handles most of this once config is right.

## What needs to happen

- **Custom scheme (`trace://`)**:
  - Already configured in `app.json` from ticket 05.
  - Supported paths resolved by Expo Router file structure:
    - `trace://sessions/:groupId/:sessionId` → session stream
    - `trace://channels/:id` → coding channel
    - `trace://auth/callback?token=...` → handled by sign-in flow (ticket 09)
  - Verify via `xcrun simctl openurl booted trace://sessions/g1/s1` — should route correctly when signed in (and show sign-in otherwise with a redirect-after-auth parameter).
- **Universal links (`https://example.com/m/...`)**:
  - Add `ios.associatedDomains: ['applinks:example.com']` to `app.json`.
  - Server: host `.well-known/apple-app-site-association` at `https://example.com/` with:
    ```json
    {
      "applinks": {
        "apps": [],
        "details": [
          {
            "appID": "TEAMID.com.trace.mobile",
            "paths": ["/m/*"]
          }
        ]
      }
    }
    ```
  - Map paths:
    - `/m/sessions/:groupId/:sessionId` → `trace://sessions/:groupId/:sessionId`
    - `/m/channels/:id` → `trace://channels/:id`
- **Redirect-after-auth**: if an unauthenticated user taps a deep link, store the intended destination in memory, present sign-in, then after auth, `router.replace(destination)`.
- **Links from web app** (non-V1, but prep): the web app can generate universal links for sharing sessions; not in V1 scope but ensure the scheme doesn't collide.

## Dependencies

- [15 — Navigation Skeleton](15-navigation-tabs.md)
- [09 — Sign-in Flow](09-sign-in-flow-and-hydration.md)
- Server (DevOps): host AASA file at production domain.

## Completion requirements

- [ ] `trace://` scheme routes to correct screens when signed in
- [ ] When signed out, deep link is remembered and applied after auth
- [ ] Universal links work: tapping `https://example.com/m/sessions/...` opens the app
- [ ] AASA file validates via Apple's validator

## How to test

1. `xcrun simctl openurl booted trace://sessions/g1/s1` → session stream for that id (or 404 screen if not found).
2. Sign out → `xcrun simctl openurl booted trace://sessions/g1/s1` → sign-in → after auth → session stream.
3. On a real device, SMS yourself `https://example.com/m/sessions/g1/s1` → tap → app opens directly to session.
4. Apple AASA validator (https://branch.io/resources/aasa-validator/) reports valid.
