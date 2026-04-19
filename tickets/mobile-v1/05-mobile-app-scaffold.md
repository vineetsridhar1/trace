# 05 — Mobile App Scaffold (Expo + EAS + Workspace Wiring)

## Summary

Create the `apps/mobile/` workspace as an Expo project with the New Architecture enabled, TypeScript strict, and a dev client configured. Wire it into the pnpm workspace so it can consume `@trace/client-core` and `@trace/gql`. Configure EAS Build profiles for development, preview, and production. No screens yet — just the shell that starts up and prints a placeholder.

## What needs to happen

- From repo root, create `apps/mobile/` via `npx create-expo-app --template tabs@latest apps/mobile` (or hand-roll if the template adds unwanted boilerplate; strip to minimum).
- Configure `app.json`:
  - Name, slug, scheme (`trace`), bundleIdentifier (`com.trace.mobile`)
  - iOS `supportsTablet: false`, `userInterfaceStyle: dark`
  - `newArchEnabled: true`
  - `plugins`: `expo-router`, `expo-dev-client`, `expo-secure-store`, `expo-notifications`, `expo-haptics`
- Configure `eas.json` with profiles:
  - `development` — dev client, internal distribution, simulator supported
  - `preview` — release build, internal distribution, TestFlight-ready
  - `production` — release build, store distribution
- `package.json`:
  - Name `@trace/mobile`, private
  - Dependencies: `expo`, `expo-router`, `expo-dev-client`, `react-native`, `react`, `@trace/client-core`, `@trace/gql`, `zustand`, `urql`, `graphql`, `graphql-ws`
  - Dev deps: `typescript`, `@types/react`, shared ESLint/Prettier configs
- `tsconfig.json` extends `tsconfig.base.json`, adds `jsx: react-jsx`, `paths` for `@/*` → `src/*`
- Add Metro config (`metro.config.js`) that supports the monorepo — `nodeModulesPaths` and `watchFolders` pointing at repo root so `@trace/client-core` resolves correctly. Reference Expo monorepo docs.
- Bare-minimum `app/_layout.tsx` and `app/index.tsx` that render `<Text>Trace Mobile</Text>`.
- Verify the dev client builds via `eas build --profile development --platform ios`.

## Dependencies

- [01 — `packages/client-core` Scaffolding](01-client-core-scaffolding.md) (just for workspace resolution — doesn't need entity store yet)

## Completion requirements

- [ ] `apps/mobile/` exists with expo-router scaffold
- [ ] New Architecture enabled (`newArchEnabled: true`)
- [ ] pnpm workspace resolves `@trace/client-core` inside `apps/mobile`
- [ ] Metro resolves monorepo packages without symlink errors
- [ ] EAS dev client build succeeds for iOS
- [ ] Running `pnpm --filter @trace/mobile start` and opening the dev client displays the placeholder screen
- [ ] `pnpm build` and `pnpm typecheck` include `apps/mobile`

## How to test

1. `pnpm install` from repo root.
2. `pnpm --filter @trace/mobile start` — Metro starts.
3. Install dev client on simulator (`eas build` output URL) — app opens, shows placeholder.
4. `pnpm typecheck` passes with the new app included.
