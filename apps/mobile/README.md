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

## Over-the-air updates

EAS Update is configured with fingerprint runtime versioning and separate `preview` and `production` channels. Install and authenticate the EAS CLI before publishing:

```bash
npm install --global eas-cli
eas login
```

Publish JavaScript, styling, and asset changes from the repository root:

```bash
pnpm --filter @trace/mobile update:preview -- --message "Describe the update"
pnpm --filter @trace/mobile update:production -- --message "Describe the update"
```

Only builds created from the matching EAS build profile receive an update. Build and install a new binary before the first update, or whenever native dependencies, Expo config, permissions, or the runtime fingerprint change:

```bash
cd apps/mobile
eas build --profile preview --platform all
eas build --profile production --platform all
```

Production OTA updates should be tested on the `preview` channel first. Updates are downloaded asynchronously on cold launch by default and run on a subsequent restart.

## Typecheck

```bash
pnpm --filter @trace/mobile typecheck
```
