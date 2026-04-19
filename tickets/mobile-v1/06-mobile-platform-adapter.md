# 06 — Mobile Platform Adapter

## Summary

Implement the `Platform` interface for mobile using `expo-secure-store` (token storage in Keychain), `react-native-mmkv` (fast persistent key/value for non-sensitive data), and React Native's native `fetch` and `WebSocket`. Wire it up at app boot so every `@trace/client-core` call routes through mobile-native APIs.

## What needs to happen

- Install dependencies: `expo-secure-store`, `react-native-mmkv`, and `react-native-nitro-modules`. MMKV v4 is a Nitro Module — nitro is a peer dep and must be declared directly in `apps/mobile/package.json` so `@react-native-community/cli` autolinks it into the iOS/Android build. Without the direct declaration the dev client will either fail to build or throw "nitro module not found" at the first `createMMKV(...)` call.
- Create `apps/mobile/src/lib/platform-mobile.ts`:
  ```ts
  import { setPlatform } from '@trace/client-core';
  import * as SecureStore from 'expo-secure-store';
  import { createMMKV } from 'react-native-mmkv';

  const storage = createMMKV({ id: 'trace' });
  const TOKEN_KEY = 'trace_token';

  setPlatform({
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
    storage: {
      getItem: (k) => storage.getString(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => {
        storage.remove(k);
      },
    },
    secureStorage: {
      getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
      setToken: (t) => SecureStore.setItemAsync(TOKEN_KEY, t),
      clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
    },
    fetch: global.fetch,
    createWebSocket: (url, protocols) => new WebSocket(url, protocols),
  });
  ```
  `apiUrl` is required by the `Platform` contract — `@trace/client-core` builds absolute URLs (`${apiUrl}/auth/me`, etc.) so the mobile app must inject it. Use whatever Expo env var the app already exposes for the server URL. Note: in mmkv v4 the `MMKV` export is a type, not a constructor — use `createMMKV(...)`. The delete method is `remove`, not `delete`.
- Import this file at the top of `apps/mobile/app/_layout.tsx` — before any client-core usage.
- Update `apps/mobile/metro.config.js` so Metro can resolve the workspace TypeScript sources. `@trace/client-core` ships TS source with ESM-style `.js` import specifiers (e.g. `from "./platform.js"`), which TypeScript rewrites at compile time but Metro does not. Add a `resolver.resolveRequest` hook that strips the `.js` suffix on relative imports and lets Metro resolve against `.ts`/`.tsx` via `sourceExts`. Without this, the first Metro bundle that touches client-core fails with "Unable to resolve module ./platform.js".
- Replace the placeholder screen with a `useEffect` that calls `fetchMe()` and logs the result (proves end-to-end wiring works; will be replaced in next ticket).
- Document in `apps/mobile/README.md` that the platform init must run before any client-core import executes.

## Dependencies

- [05 — Mobile App Scaffold](05-mobile-app-scaffold.md)
- [03 — Extract Auth Store](03-extract-auth-store.md)

## Completion requirements

- [x] `setPlatform` is called at app boot with mobile-native impls
- [x] Token stored via `SecureStore` (Keychain); other state via MMKV
- [ ] `fetchMe()` successfully calls the Trace server over the network from the dev client (manual — requires dev client build + token seeding; see "How to test")
- [x] No references to `localStorage`, `window`, or `document` anywhere in `apps/mobile/src/`
- [x] `pnpm --filter @trace/mobile typecheck` passes

## How to test

1. Start server locally (`pnpm dev:server`).
2. Temporarily seed a valid token into Keychain (hard-code in dev code for testing).
3. Run the mobile dev client pointed at local server (via LAN IP).
4. Verify `fetchMe()` call returns user + org memberships, logged to Metro console.
5. Revert hard-coded token before committing.
