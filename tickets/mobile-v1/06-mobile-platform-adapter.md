# 06 — Mobile Platform Adapter

## Summary

Implement the `Platform` interface for mobile using `expo-secure-store` (token storage in Keychain), `react-native-mmkv` (fast persistent key/value for non-sensitive data), and React Native's native `fetch` and `WebSocket`. Wire it up at app boot so every `@trace/client-core` call routes through mobile-native APIs.

## What needs to happen

- Install dependencies: `expo-secure-store`, `react-native-mmkv`.
- Create `apps/mobile/src/lib/platform-mobile.ts`:
  ```ts
  import { setPlatform } from '@trace/client-core';
  import * as SecureStore from 'expo-secure-store';
  import { MMKV } from 'react-native-mmkv';

  const storage = new MMKV({ id: 'trace' });
  const TOKEN_KEY = 'trace_token';

  setPlatform({
    storage: {
      getItem: k => storage.getString(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: k => storage.delete(k),
    },
    secureStorage: {
      getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
      setToken: t => SecureStore.setItemAsync(TOKEN_KEY, t),
      clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
    },
    fetch: global.fetch,
    createWebSocket: (url, protocols) => new WebSocket(url, protocols),
  });
  ```
- Import this file at the top of `apps/mobile/app/_layout.tsx` — before any client-core usage.
- Replace the placeholder screen with a `useEffect` that calls `fetchMe()` and logs the result (proves end-to-end wiring works; will be replaced in next ticket).
- Document in `apps/mobile/README.md` that the platform init must run before any client-core import executes.

## Dependencies

- [05 — Mobile App Scaffold](05-mobile-app-scaffold.md)
- [03 — Extract Auth Store](03-extract-auth-store.md)

## Completion requirements

- [ ] `setPlatform` is called at app boot with mobile-native impls
- [ ] Token stored via `SecureStore` (Keychain); other state via MMKV
- [ ] `fetchMe()` successfully calls the Trace server over the network from the dev client
- [ ] No references to `localStorage`, `window`, or `document` anywhere in `apps/mobile/src/`
- [ ] `pnpm --filter @trace/mobile typecheck` passes

## How to test

1. Start server locally (`pnpm dev:server`).
2. Temporarily seed a valid token into Keychain (hard-code in dev code for testing).
3. Run the mobile dev client pointed at local server (via LAN IP).
4. Verify `fetchMe()` call returns user + org memberships, logged to Metro console.
5. Revert hard-coded token before committing.
