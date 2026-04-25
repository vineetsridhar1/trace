# @trace/mobile

Expo + React Native client for Trace.

## Platform initialization

`@trace/client-core` is platform-agnostic. It accesses storage, the network, and WebSockets through a `Platform` object that must be registered via `setPlatform()` before any client-core API is called.

The mobile adapter lives at `src/lib/platform-mobile.ts` and wires up:

- `expo-secure-store` — bearer token (Keychain on iOS, EncryptedSharedPreferences on Android)
- `react-native-mmkv` — fast persistent key/value for non-sensitive state
- `global.fetch` and `WebSocket` — React Native's native implementations

The adapter is imported by the custom entry point `index.js` (set as `package.json#main`) **before** `expo-router/entry`. This ordering matters: Expo Router calls `loadRoute()` for every layout during route-tree construction (before rendering), and any layout that touches client-core would otherwise crash if `app/_layout.tsx` hadn't been loaded first. Routing the side effect through `index.js` guarantees `setPlatform()` runs before any route module is evaluated. **Do not move `setPlatform()` out of `index.js`** without verifying every layout still loads after it.

## Environment variables

Set `EXPO_PUBLIC_API_URL` to the Trace server URL the dev client should hit (e.g. `http://192.168.1.10:4000` for LAN access from a physical device). Set `EXPO_PUBLIC_EAS_PROJECT_ID` for local/dev-client push token registration when the EAS project id is not present in native build metadata. Any `EXPO_PUBLIC_*` variable is inlined into the JS bundle at build time.

## Running the dev client

```bash
pnpm dev:server                         # in repo root
EXPO_PUBLIC_API_URL=http://<lan-ip>:4000 EXPO_PUBLIC_EAS_PROJECT_ID=<eas-project-id> pnpm --filter @trace/mobile start
```

## Typecheck

```bash
pnpm --filter @trace/mobile typecheck
```
