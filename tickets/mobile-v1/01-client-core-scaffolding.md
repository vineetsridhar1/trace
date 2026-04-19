# 01 — `packages/client-core` Scaffolding & Platform Interface

## Summary

Create a new workspace package `@trace/client-core` that will hold all platform-free client logic currently living in `apps/web/src/`. This ticket lays the scaffolding: package setup, build/tsconfig, Platform interface, and a CI lint rule preventing web-specific imports. No code moves in this ticket — it only prepares the target.

## What needs to happen

- Create directory `packages/client-core/` with:
  - `package.json` — name `@trace/client-core`, private, peerDependencies on `react`, `zustand`, `urql`, `@urql/core`, `graphql`, `@trace/gql`
  - `tsconfig.json` — extends `tsconfig.base.json`
  - `src/index.ts` — barrel export
  - `src/platform.ts` — defines the `Platform` interface (see below)
- Add `Platform` interface to `src/platform.ts`:
  ```ts
  export interface Platform {
    storage: {
      getItem(key: string): string | null | Promise<string | null>;
      setItem(key: string, value: string): void | Promise<void>;
      removeItem(key: string): void | Promise<void>;
    };
    secureStorage: {
      getToken(): Promise<string | null>;
      setToken(token: string): Promise<void>;
      clearToken(): Promise<void>;
    };
    fetch: typeof fetch;
    createWebSocket: (url: string, protocols?: string[]) => WebSocket;
  }
  ```
- Add `setPlatform(platform: Platform)` / `getPlatform(): Platform` accessor pair so consumers can inject their impl once at boot.
- Add to `pnpm-workspace.yaml` (if not auto-included by the `packages/*` glob — verify).
- Add an ESLint `no-restricted-imports` rule to `packages/client-core/.eslintrc.cjs` that forbids: `react-dom`, `react-dom/*`, any import from `window`, `document`, `localStorage`, `sessionStorage`.
- Add a CI step (or extend `pnpm lint`) that lints `packages/client-core` separately so violations fail the build.
- Verify `pnpm build` succeeds with the empty package exporting only the Platform interface.

## Dependencies

None — this is the first ticket of M0.

## Completion requirements

- [ ] `packages/client-core` builds with `pnpm build`
- [ ] `Platform` interface exported from the package
- [ ] Importing `react-dom` or referencing `window` inside `packages/client-core/src/` fails lint
- [ ] Package is resolvable as `@trace/client-core` from `apps/web`

## How to test

1. From repo root: `pnpm install && pnpm build`
2. `pnpm lint` — should pass with no files in client-core yet.
3. Temporarily add `import 'react-dom';` to `src/index.ts` — `pnpm lint` should fail. Revert.
4. From `apps/web`, import `Platform` from `@trace/client-core` — should type-check.
