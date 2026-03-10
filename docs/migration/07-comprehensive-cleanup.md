# Ticket 7: Comprehensive Cleanup & Quality

## Goal
Audit and clean up every remaining file in the web app not touched by Tickets 1-6. Ensure consistent patterns, remove dead code, document the Apollo cache policy, and improve TypeScript strictness. After this ticket, every file in `apps/web/src/` follows the same conventions and there are no orphaned patterns.

## Context

Tickets 1-6 address the biggest architectural problems but only touch ~17 of the ~48 source files in the web app. This ticket ensures the remaining ~31 files are consistent with the new patterns established by the previous tickets.

## Tasks

### 1. Audit and clean up `WorkspacePage.tsx` (252 lines)

**File**: `apps/web/src/pages/WorkspacePage.tsx`

This is the main workspace view and the largest page component. After Tickets 2-6, it may already be cleaner, but verify:

- **Error boundaries**: Ticket 5 adds error boundaries around major panels. Verify they are in place around `WebWorkspaceList`, `WebThreadPanel`, `WebThreadInput`, and any tab content.
- **Props plumbing**: After Ticket 2, `clearSession` and `loadOlderEvents` must be passed from `useThreadSync()` through to `WebThreadPanel`. Verify this plumbing exists.
- **Tab state**: The active tab state (`thread` / `changes`) and any tab-switching logic should use local component state, not a global store.
- **Thread width**: The drag-to-resize logic for the thread panel width should use `storage.ts` (from Ticket 1) instead of direct `localStorage`.
- **Import cleanup**: Remove any imports that are no longer used after other tickets.

Target: The file should be under 200 lines after other tickets extract sub-components.

### 2. Clean up `WebModelEffortSelector.tsx` (216 lines)

**File**: `apps/web/src/components/WebModelEffortSelector.tsx`

This is the second-largest untouched component. Review for:
- Extract any inline sub-components (cycling animation, effort pill) if they have their own state
- Ensure it uses `MODE_CONFIG` from `shared/interactionModes.tsx` if it references interaction modes
- Remove any dead code paths

### 3. Clean up `WebRunButtons.tsx` (152 lines)

**File**: `apps/web/src/components/WebRunButtons.tsx`

- Verify it imports `InteractionMode` and mode config from `shared/interactionModes.tsx`
- Ensure consistent use of `useRunner()` (from Ticket 3) instead of `useInstance()` if it calls any relay actions
- Check for duplicated mode-cycling logic that should use `ModeToggle.tsx` (from Ticket 4)

### 4. Clean up `InstancePasswordModal.tsx` (113 lines)

**File**: `apps/web/src/components/InstancePasswordModal.tsx`

- Verify it uses `useInstance()` only for `connectToInstance` (not `relayAction`)
- Ensure form handling follows consistent patterns (controlled inputs, proper cleanup)

### 5. Clean up smaller components

Review each of these small components for consistency:

**`ConnectionStatusBar.tsx`** (51 lines):
- Should use `useRunner()` from Ticket 3 for status instead of `useInstance()` for relay status
- Verify it handles all `RunnerStatus` values (`connected`, `connecting`, `disconnected`)

**`WebChannelSelector.tsx`** (62 lines):
- Verify it uses `ChannelContext` correctly
- No changes likely needed

**`WebFileMentionMenu.tsx`** (62 lines):
- Verify props are typed correctly
- No changes likely needed

**`WebImageThumbnails.tsx`** (79 lines):
- Verify it doesn't have memory leaks (object URL cleanup)
- No changes likely needed

**`WebSlashCommandMenu.tsx`** (61 lines):
- Verify props are typed correctly
- No changes likely needed

### 6. Clean up hooks

**`useFileMention.ts`** (236 lines):
- This is the largest untouched hook. Review for:
  - Uses `useRepoRelay()` — after Ticket 3, this should already go through `useRunner()`
  - Has its own debounce logic — verify it doesn't conflict with new patterns
  - Check for any `useInstance()` imports that should be removed

**`useImageAttachments.ts`** (147 lines):
- Verify base64 encoding/decoding is handled efficiently
- Check for object URL memory leaks (should call `URL.revokeObjectURL` on cleanup)

**`useSlashCommands.ts`** (180 lines):
- Uses `useRepoRelay()` — should already go through `useRunner()` after Ticket 3
- Verify no direct `useInstance()` usage

**`useWorkspaceSync.ts`** (69 lines):
- Verify it uses Apollo queries correctly (not bypassing the cache unnecessarily)
- Check that it doesn't conflict with the workspace subscription handling in `useChannelSubscriptions.ts`

**`useWorktreeChanges.ts`** (55 lines):
- Uses `useWorktreeRelay()` — should already go through `useRunner()` after Ticket 3
- Has 15-second polling interval — verify cleanup on unmount

**`usePRStatus.ts`** (47 lines):
- Uses `useGitHubRelay()` — should already go through `useRunner()` after Ticket 3
- Has 30-second polling — verify cleanup on unmount

### 7. Clean up pages

**`LoginPage.tsx`** (63 lines):
- Verify it uses `AuthContext` correctly
- After Ticket 5, it should be lazy-loaded — verify the lazy import exists in `App.tsx`

**`AuthCallbackPage.tsx`** (59 lines):
- After Ticket 1, should use `storage.ts` instead of direct `localStorage` calls
- After Ticket 5, should be lazy-loaded

**`InstancePickerPage.tsx`** (178 lines):
- Review for any direct `localStorage` usage — migrate to `storage.ts`
- After Ticket 5, should be lazy-loaded
- Check for any `relayAction` usage that should go through `useRunner()` — but instance picker runs before connection, so it likely only uses `connectToInstance`

### 8. Document Apollo cache typePolicies

**File**: `apps/web/src/graphql/client.ts`

The Apollo client has 15 type policies with `keyFields: false`:
```ts
WorkspaceCliSession, WorkspaceUser, WorkspaceConnection, EventConnection,
SessionConnection, RepoValidation, CreateWorkspacePayload,
AiChatMessageConnection, SessionEventPayload, TicketUpsertPayload,
ChannelMessageConnection, ChannelMessageAuthor, PresenceUser,
WorkspacePresence, PresencePayload
```

Add a comment block explaining WHY `keyFields: false` is used for each category:

```ts
typePolicies: {
  // --- Non-normalizable nested objects (no stable ID field) ---
  // These types are embedded within parent objects and don't have
  // their own unique identifiers in the GraphQL schema.
  WorkspaceCliSession: { keyFields: false },
  WorkspaceUser: { keyFields: false },
  WorkspaceConnection: { keyFields: false },

  // --- Connection/pagination types ---
  // Relay-style connection wrappers. Normalizing these by their
  // fields would create cache conflicts between different queries.
  EventConnection: { keyFields: false },
  SessionConnection: { keyFields: false },
  AiChatMessageConnection: { keyFields: false },
  ChannelMessageConnection: { keyFields: false },

  // --- Mutation payloads ---
  // One-off response shapes returned by mutations, not cacheable entities.
  RepoValidation: { keyFields: false },
  CreateWorkspacePayload: { keyFields: false },

  // --- Subscription payloads ---
  // Ephemeral shapes delivered via subscriptions.
  SessionEventPayload: { keyFields: false },
  TicketUpsertPayload: { keyFields: false },

  // --- Presence types ---
  // Real-time presence data, not normalized entities.
  ChannelMessageAuthor: { keyFields: false },
  PresenceUser: { keyFields: false },
  WorkspacePresence: { keyFields: false },
  PresencePayload: { keyFields: false },
},
```

Also review whether any of these can be removed. In particular:
- `AiChatMessageConnection` — is AI chat still used in the web app? If not, remove.
- `ChannelMessageConnection` / `ChannelMessageAuthor` — are channel messages used? If not, remove.

### 9. Clean up `types.ts` (256 lines)

**File**: `apps/web/src/types.ts`

Review for:
- **Dead types**: After deleting `appUIStore.ts` (Ticket 1), check if `MiddlePanelView`, `DragTarget`, `ChannelType`, `AiChat`, `ProductDocMode` are still used anywhere. Remove any that have zero consumers.
- **Consistency**: Ensure all workspace/session types are consistent with the GraphQL schema (some types may have drifted from the auto-generated types).
- **Exports**: Verify all exported types are used. Remove unused exports.

Run:
```bash
# For each type exported from types.ts, check if it's imported anywhere:
for type in $(grep "^export " apps/web/src/types.ts | sed 's/export [a-z]* //' | sed 's/ .*//' | sed 's/[{;]//g'); do
  echo "=== $type ===";
  grep -r "$type" apps/web/src/ --include="*.ts" --include="*.tsx" -l | grep -v "types.ts";
done
```

### 10. Clean up `main.tsx` (24 lines)

**File**: `apps/web/src/main.tsx`

- Verify it imports the Apollo client from `graphql/client.ts` correctly
- Ensure `StrictMode` is enabled
- No changes likely needed

### 11. Improve TypeScript strictness

**File**: `apps/web/tsconfig.json`

Add stricter compiler options to catch more issues at build time:

```json
{
  "compilerOptions": {
    // ... existing options ...
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false
  }
}
```

After enabling these, fix any resulting errors:
- `noUnusedLocals` — remove or prefix with `_` any unused variables
- `noUnusedParameters` — prefix unused function params with `_`
- `noImplicitReturns` — add explicit returns to all code paths
- `noFallthroughCasesInSwitch` — add `break` to all switch cases

**Warning**: This may surface many errors across the codebase. Fix them all — this is part of the cleanup.

### 12. Final consistency pass

After all other tasks, do a final grep-based consistency check:

```bash
# No direct localStorage calls (should all go through lib/storage.ts)
grep -r "localStorage\." apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v "lib/storage.ts"

# No useInstance() in relay hooks (should all use useRunner())
grep -r "useInstance()" apps/web/src/hooks/relay/

# No syncActions or workspaceActions references
grep -r "syncActions\|workspaceActions" apps/web/src/

# No duplicate fragment definitions
grep -r "fragment WorkspaceFields" apps/web/src/

# No duplicate MODE_CONFIG/MODE_CYCLE
grep -rn "const MODE_CONFIG\|const MODE_CYCLE" apps/web/src/

# No imports from utils.ts (should be deleted)
grep -r "from.*utils" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|__generated__"

# All relay hooks use useRunner
for f in apps/web/src/hooks/relay/use*Relay.ts; do
  echo "=== $f ===";
  grep -c "useRunner\|useInstance" "$f";
done
```

Each of these checks should pass cleanly. Fix any violations found.

## Verification

1. `cd apps/web && npx tsc --noEmit` — no type errors with stricter settings
2. `cd apps/web && npx vite build` — production build succeeds
3. `make web-gql` — codegen works
4. All consistency grep checks from Task 12 pass
5. Functional test: Full user flow — login, connect instance, view workspaces, open thread, send message, switch workspaces, view changes tab
6. No file in `apps/web/src/components/` exceeds 200 lines (except `WebModelEffortSelector.tsx` if its complexity requires it)
7. `grep -r "localStorage\." apps/web/src/ | grep -v "lib/storage.ts"` — returns nothing

## Files Changed
- **Modified**: `apps/web/tsconfig.json` (stricter options), `apps/web/src/graphql/client.ts` (documented typePolicies), `apps/web/src/types.ts` (removed dead types), `apps/web/src/pages/WorkspacePage.tsx` (cleanup), and potentially any file that fails the new TypeScript strictness checks
- **Possibly modified**: `apps/web/src/components/WebModelEffortSelector.tsx`, `apps/web/src/components/WebRunButtons.tsx`, `apps/web/src/components/ConnectionStatusBar.tsx`, `apps/web/src/pages/InstancePickerPage.tsx`, various hooks
- **Possibly deleted**: Dead types from `types.ts`, unused typePolicies from `client.ts`

## Dependencies
- Should be run LAST — after Tickets 1-6 are all complete
- Depends on all patterns being established: `storage.ts`, event bus, `useRunner()`, component extraction, error boundaries, session cache
