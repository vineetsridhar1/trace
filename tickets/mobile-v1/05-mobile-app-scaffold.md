# 05 — Mobile App Scaffold (Expo + EAS + Workspace Wiring)

## Summary

Create the `apps/mobile/` workspace as an Expo project with the New Architecture enabled, TypeScript strict, and a dev client configured. Wire it into the pnpm workspace so it can consume `@trace/client-core` and `@trace/gql`. Configure EAS Build profiles for development, preview, and production. No screens yet — just the shell that starts up and prints a placeholder.

## What needs to happen

- From repo root, create `apps/mobile/` via `npx create-expo-app --template tabs@latest apps/mobile` (or hand-roll if the template adds unwanted boilerplate; strip to minimum).
- Configure `app.json`:
  - Name, slug, scheme (`trace`), bundleIdentifier (`com.trace.mobile`)
  - iOS `supportsTablet: false`, `userInterfaceStyle: dark`
  - `newArchEnabled: true`
  - `plugins`: `expo-router`, `expo-dev-client`, `expo-secure-store`, `expo-notifications`
    - Note: `expo-haptics` is a dependency but NOT a config plugin — don't add it to the plugins array, it triggers `PluginError: Package "expo-haptics" does not contain a valid config plugin`.
- Configure `eas.json` with profiles:
  - `development` — dev client, internal distribution, simulator supported
  - `preview` — release build, internal distribution, TestFlight-ready
  - `production` — release build, store distribution
- `package.json`:
  - Name `@trace/mobile`, private
  - Dependencies: `expo`, `expo-router`, `expo-dev-client`, `react-native`, `react`, `@trace/client-core`, `@trace/gql`, `zustand`, `urql`, `graphql`, `graphql-ws`
  - Dev deps: `typescript`, `@types/react`, shared ESLint/Prettier configs
- `tsconfig.json` extends `expo/tsconfig.base` (not the repo's `tsconfig.base.json` — that one is tuned for Node/bundler targets and lacks RN types), sets `strict: true`, and adds `paths` for `@/*` → `src/*`. `jsx: react-jsx` comes from the Expo base.
- Add Metro config (`metro.config.js`) that supports the monorepo — push the workspace root onto `watchFolders` (extend, don't replace), and set `resolver.nodeModulesPaths` to include both project and workspace `node_modules`. Reference Expo monorepo docs. With `node-linker=hoisted` (the repo default), `resolver.disableHierarchicalLookup` should be left at its default — setting it `true` is unnecessary and is flagged by expo-doctor.
- Bare-minimum `app/_layout.tsx` and `app/index.tsx` that render `<Text>Trace Mobile</Text>`.
- Pin `@types/react` at the workspace level. Add `"@types/react": "~19.1.0"` to the root `package.json`'s `pnpm.overrides`. RN 0.81 requires `react@19.1.0` exactly, and without this pin mobile (on `@types/react@19.1.x`) and web (on `@types/react@^19.0.0` → 19.2.x) end up with two `@types/react` trees, which breaks `apps/web`'s `tsc` build.
- Verify the dev client builds via `eas build --profile development --platform ios`.

## Dependencies

- [01 — `packages/client-core` Scaffolding](01-client-core-scaffolding.md) (just for workspace resolution — doesn't need entity store yet)

## Completion requirements

- [x] `apps/mobile/` exists with expo-router scaffold
- [x] New Architecture enabled (`newArchEnabled: true`)
- [x] pnpm workspace resolves `@trace/client-core` inside `apps/mobile`
- [x] Metro resolves monorepo packages without symlink errors
- [ ] EAS dev client build succeeds for iOS (manual — requires Expo account)
- [ ] Running `pnpm --filter @trace/mobile start` and opening the dev client displays the placeholder screen (manual — requires simulator)
- [x] `pnpm build` and `pnpm typecheck` include `apps/mobile`

## How to test

1. `pnpm install` from repo root.
2. `pnpm --filter @trace/mobile start` — Metro starts.
3. Install dev client on simulator (`eas build` output URL) — app opens, shows placeholder.
4. `pnpm typecheck` passes with the new app included.
