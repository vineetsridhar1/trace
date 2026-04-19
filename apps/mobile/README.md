# @trace/mobile

Expo + React Native client for Trace.

## Platform initialization

`@trace/client-core` is platform-agnostic. It accesses storage, the network, and WebSockets through a `Platform` object that must be registered via `setPlatform()` before any client-core API is called.

The mobile adapter lives at `src/lib/platform-mobile.ts` and wires up:

- `expo-secure-store` — bearer token (Keychain on iOS, EncryptedSharedPreferences on Android)
- `react-native-mmkv` — fast persistent key/value for non-sensitive state
- `global.fetch` and `WebSocket` — React Native's native implementations

The adapter is imported at the very top of `app/_layout.tsx` so the `setPlatform()` side effect runs before Expo Router renders any screen that touches client-core. **Do not import client-core from files that are evaluated before `app/_layout.tsx`** — nothing should reach `getPlatform()` before the adapter has registered.

## Environment variables

Set `EXPO_PUBLIC_API_URL` to the Trace server URL the dev client should hit (e.g. `http://192.168.1.10:4000` for LAN access from a physical device). Any `EXPO_PUBLIC_*` variable is inlined into the JS bundle at build time.

## Running the dev client

```bash
pnpm dev:server                         # in repo root
EXPO_PUBLIC_API_URL=http://<lan-ip>:4000 pnpm --filter @trace/mobile start
```

## Typecheck

```bash
pnpm --filter @trace/mobile typecheck
```
