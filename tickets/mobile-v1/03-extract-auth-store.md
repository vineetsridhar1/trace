# 03 — Extract Auth Store with Platform Adapter

## Summary

Move the auth store (`apps/web/src/stores/auth.ts`) into `@trace/client-core` and refactor it to depend on the `Platform` abstraction for token storage instead of `localStorage` directly. Web injects a web-platform impl (localStorage-backed) on boot. Mobile will inject its own (Keychain-backed) in M1.

## What needs to happen

- Move `apps/web/src/stores/auth.ts` to `packages/client-core/src/stores/auth.ts`.
- Replace all direct `localStorage.getItem/setItem` calls with calls through `getPlatform().storage.*`. Token access specifically goes through `getPlatform().secureStorage.*`.
- Make the GitHub OAuth popup flow (`openPopup`, `onMessage`) remain in `apps/web` — it's web-specific. Extract a platform-agnostic `signInWithToken(token: string)` method in the client-core auth store that mobile and web both call once they've obtained a token.
- Keep `fetchMe`, `signOut`, `setActiveOrg`, `getAuthHeaders` in client-core (all platform-free).
- Create `apps/web/src/lib/platform-web.ts`:
  ```ts
  import { setPlatform } from '@trace/client-core';
  setPlatform({
    storage: { getItem: k => localStorage.getItem(k), setItem: (k,v) => localStorage.setItem(k,v), removeItem: k => localStorage.removeItem(k) },
    secureStorage: {
      getToken: async () => localStorage.getItem('trace_token'),
      setToken: async t => localStorage.setItem('trace_token', t),
      clearToken: async () => localStorage.removeItem('trace_token'),
    },
    fetch: window.fetch.bind(window),
    createWebSocket: (url, protocols) => new WebSocket(url, protocols),
  });
  ```
- Call the platform init as the very first thing in `apps/web/src/main.tsx`, before any store usage.
- Update all imports in `apps/web` referencing `@/stores/auth` to `@trace/client-core`.

## Dependencies

- [01 — `packages/client-core` Scaffolding](01-client-core-scaffolding.md)

## Completion requirements

- [x] `packages/client-core/src/stores/auth.ts` has no direct references to `localStorage`, `window`, or `document`
- [x] `apps/web/src/lib/platform-web.ts` wires the web platform once at boot
- [x] Existing web sign-in flow (GitHub OAuth popup → token → `signInWithToken` → `fetchMe`) works unchanged
- [x] `pnpm lint` passes
- [ ] Manual smoke: sign out, sign in, switch org — all work

## How to test

1. `pnpm typecheck` and `pnpm lint` pass.
2. Clear localStorage. Run web, sign in via GitHub — succeeds. Reload — still signed in. Sign out — token cleared.
3. Switch active org from the org switcher — works.
