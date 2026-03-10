# Ticket 1: Foundation & Tooling

## Goal
Set up path aliases, feature directory skeleton, centralized localStorage utility, and lightweight event bus. Delete the dead `appUIStore.ts` from the web app. No behavioral changes — the app must work identically before and after.

## Context
The web app lives in `apps/web/`. It's a Vite + React SPA. We're restructuring toward a feature-based directory layout to support an incremental web-first rebuild.

Key finding: `appUIStore.ts` exists in `apps/web/src/stores/` but is **never imported** by any file in the web app. It's dead code copied from the desktop app. It should be deleted.

## Tasks

### 1. Add `@features` path alias

**`apps/web/vite.config.ts`** — add `resolve.alias`:
```ts
import path from "path";

export default defineConfig({
  // ...existing config
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  // ...rest
});
```

**`apps/web/tsconfig.json`** — add matching paths (the `@/*` alias already exists):
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["src/*"],
      "@features/*": ["src/features/*"],
      "@lib/*": ["src/lib/*"]
    }
  }
}
```

### 2. Create feature directory skeleton

Create these empty directories with `.gitkeep` files:
```
apps/web/src/features/auth/
apps/web/src/features/instance/
apps/web/src/features/channel/
apps/web/src/features/workspace/
apps/web/src/features/thread/
apps/web/src/features/runner/
apps/web/src/features/agent/
apps/web/src/features/shared/
apps/web/src/lib/
```

### 3. Create `apps/web/src/lib/storage.ts`

A typed wrapper around localStorage. This will be used by future stores that need persistence.

```ts
const STORAGE_PREFIX = 'trace:';

const KEYS = {
  channelViewMap: `${STORAGE_PREFIX}channelViewMap`,
  threadWidth: `${STORAGE_PREFIX}threadWidth`,
  token: 'trace_token',
  user: 'trace_user',
  activeChannelId: 'activeChannelId',
  authorizedInstances: 'trace_authorized_instances',
} as const;

type StorageKey = keyof typeof KEYS;

export const storage = {
  get<T>(key: StorageKey, fallback: T): T {
    try {
      const raw = localStorage.getItem(KEYS[key]);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  getString(key: StorageKey): string | null {
    return localStorage.getItem(KEYS[key]);
  },

  set(key: StorageKey, value: unknown): void {
    try {
      localStorage.setItem(KEYS[key], JSON.stringify(value));
    } catch {
      // quota error — ignore
    }
  },

  setString(key: StorageKey, value: string): void {
    try {
      localStorage.setItem(KEYS[key], value);
    } catch {
      // quota error — ignore
    }
  },

  remove(key: StorageKey): void {
    localStorage.removeItem(KEYS[key]);
  },
};
```

### 4. Create `apps/web/src/lib/events.ts`

A lightweight typed event bus for decoupling hooks from subscription callbacks. This replaces the "registered actions" pattern (Ticket 2 will use it).

```ts
type EventHandler<T = unknown> = (detail: T) => void;

class TypedEventBus {
  private target = new EventTarget();

  emit<T>(name: string, detail?: T): void {
    this.target.dispatchEvent(new CustomEvent(name, { detail }));
  }

  on<T>(name: string, handler: EventHandler<T>): () => void {
    const listener = ((e: CustomEvent<T>) => handler(e.detail)) as EventListener;
    this.target.addEventListener(name, listener);
    return () => this.target.removeEventListener(name, listener);
  }
}

export const appEvents = new TypedEventBus();
```

### 5. Delete dead `appUIStore.ts`

Delete `apps/web/src/stores/appUIStore.ts`. It is not imported anywhere in the web app — confirmed by grepping for `appUIStore`, `useAppUIStore`, and `AppUI` across `apps/web/src/`. The desktop app at `apps/desktop/src/stores/appUIStore.ts` has its own copy and is unaffected.

Also delete the `isViewValidForChannel` and `getDefaultViewForChannel` exports since they have no consumers in the web app.

### 6. Clean up unused types

Check if the types imported by `appUIStore.ts` — `MiddlePanelView`, `DragTarget`, `ChannelType`, `AiChat`, `ProductDocMode` — are used elsewhere in the web app. If any of these types are only referenced by `appUIStore.ts`, they can be left alone (they may be used by the desktop app through shared types). Do not remove types from shared type files.

### 7. Migrate all direct `localStorage` calls to use `storage.ts`

After creating `lib/storage.ts`, migrate ALL existing direct `localStorage` calls to use the typed wrapper. This ensures a single source of truth for storage keys and makes it easy to audit what the app persists.

**Files with direct `localStorage` calls to migrate:**

**a) `apps/web/src/stores/threadStore.ts`** (line ~204):
```ts
// BEFORE:
const saved = parseInt(localStorage.getItem('trace:threadWidth') ?? '', 10);
// AFTER:
import { storage } from '../lib/storage';
const saved = parseInt(storage.getString('threadWidth') ?? '', 10);
```

**b) `apps/web/src/context/AuthContext.tsx`** (~4 calls):
```ts
// BEFORE:
localStorage.getItem('trace_token')
localStorage.setItem('trace_token', token)
localStorage.getItem('trace_user')
localStorage.setItem('trace_user', JSON.stringify(user))
localStorage.removeItem('trace_token')
localStorage.removeItem('trace_user')
// AFTER:
import { storage } from '../lib/storage';
storage.getString('token')
storage.setString('token', token)
storage.get('user', null)
storage.set('user', user)
storage.remove('token')
storage.remove('user')
```

**c) `apps/web/src/pages/AuthCallbackPage.tsx`** (~2 calls):
```ts
// BEFORE:
localStorage.setItem('trace_token', token);
localStorage.setItem('trace_user', JSON.stringify(user));
// AFTER:
import { storage } from '../lib/storage';
storage.setString('token', token);
storage.set('user', user);
```

**d) `apps/web/src/context/ChannelContext.tsx`** (~2 calls):
```ts
// BEFORE:
localStorage.getItem('activeChannelId')
localStorage.setItem('activeChannelId', id)
// AFTER:
import { storage } from '../lib/storage';
storage.getString('activeChannelId')
storage.setString('activeChannelId', id)
```

**e) `apps/web/src/stores/instanceStore.ts`** (authorized instances):
```ts
// BEFORE:
localStorage.getItem('trace_authorized_instances')
localStorage.setItem('trace_authorized_instances', JSON.stringify(instances))
// AFTER:
import { storage } from '../lib/storage';
storage.get('authorizedInstances', [])
storage.set('authorizedInstances', instances)
```

**f) `apps/web/src/hooks/useThreadSync.ts`** (thread width):
```ts
// BEFORE:
localStorage.getItem('trace:threadWidth')
// AFTER:
import { storage } from '../lib/storage';
storage.getString('threadWidth')
```

Run `grep -r "localStorage" apps/web/src/` after migration to confirm zero direct calls remain. The only localStorage access should be through `lib/storage.ts` itself.

### 8. Delete `apps/web/src/utils.ts`

This file is 10 lines of pure re-exports from `@trace/shared-ui`:
```ts
export { buildSessionNodes, stripTraceInternal, formatTime, normalizeToolName, serializeUnknown, extractPromptText, formatDuration } from '@trace/shared-ui';
```

These re-exports add an unnecessary layer of indirection. All consumers should import directly from `@trace/shared-ui`. Run:
```bash
grep -r "from.*['\"].*utils['\"]" apps/web/src/
```

For each consumer found, change the import to use `@trace/shared-ui` directly. Then delete `utils.ts`.

## Verification

1. `cd apps/web && npx tsc --noEmit` — no type errors
2. `cd apps/web && npx vite build` — production build succeeds
3. `cd apps/web && npx vite dev` — dev server starts, app loads
4. Navigate to `/login`, `/`, connect to an instance — all works
5. Confirm `appUIStore.ts` is gone from `apps/web/src/stores/`
6. Confirm `utils.ts` is gone from `apps/web/src/`
7. Confirm `@features` and `@lib` path aliases resolve (add a temporary test import if needed, then remove it)
8. `grep -r "localStorage" apps/web/src/` — only returns hits from `lib/storage.ts` itself

## Files Changed
- **Modified**: `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/src/stores/threadStore.ts`, `apps/web/src/context/AuthContext.tsx`, `apps/web/src/pages/AuthCallbackPage.tsx`, `apps/web/src/context/ChannelContext.tsx`, `apps/web/src/stores/instanceStore.ts`, `apps/web/src/hooks/useThreadSync.ts`, any consumers of `utils.ts`
- **Created**: `apps/web/src/lib/storage.ts`, `apps/web/src/lib/events.ts`, `.gitkeep` files in feature dirs
- **Deleted**: `apps/web/src/stores/appUIStore.ts`, `apps/web/src/utils.ts`
