# Ticket 4: Component Decomposition

## Goal
Break the 3 largest components into small (<200 line), focused files. Extract shared constants. No behavioral changes.

## Context
- `WebWorkspaceList.tsx` — 502 lines. Contains inline `CollapsibleStatusGroup`, inline `WorkspaceItem` (already memo'd), inline `NewWorkspaceModal`, status constants, interaction mode constants.
- `WebThreadPanel.tsx` — 416 lines. Contains inline `SessionNodeList` (already memo'd), inline `ThreadStatusMessage`, scroll logic, plan/question actions.
- `WebThreadInput.tsx` — read this file first; it's ~470 lines with inline `ElapsedTimer`, mode toggle logic, queue indicator, token usage display.

## Tasks

### 1. Extract shared constants

**Create `apps/web/src/components/shared/interactionModes.ts`**:
```ts
import { FiEdit3, FiMap, FiHelpCircle } from 'react-icons/fi';

export type InteractionMode = 'code' | 'plan' | 'ask';

export const MODE_CYCLE: InteractionMode[] = ['code', 'plan', 'ask'];

export const MODE_CONFIG: Record<
  InteractionMode,
  { label: string; icon: React.ReactNode; style: string }
> = {
  code: {
    label: 'Code',
    icon: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: 'btn-secondary border-edge text-primary',
  },
  plan: {
    label: 'Plan',
    icon: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: 'border-accent bg-accent/20 text-accent-light',
  },
  ask: {
    label: 'Ask',
    icon: <FiHelpCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: 'border-amber-500 bg-amber-500/20 text-amber-300',
  },
};
```

Note: Since React elements are used in the config, this file needs to be `.tsx`. Adjust extension accordingly.

**Create `apps/web/src/components/shared/statusConfig.ts`**:
```ts
import type { TicketStatus } from '../../types';

export const STATUS_DOT_COLOR: Record<TicketStatus, string> = {
  pending: 'text-yellow-400',
  creation: 'text-orange-400',
  in_progress: 'text-green-400',
  completed: 'text-gray-400',
  merged: 'text-purple-400',
  needs_input: 'text-amber-400',
  queued: 'text-cyan-400',
  review: 'text-teal-400',
  handed_off: 'text-orange-300',
};

export const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-400' },
  creation: { label: 'Creating', color: 'text-orange-400' },
  in_progress: { label: 'In Progress', color: 'text-accent-light' },
  completed: { label: 'Done', color: 'text-green-400' },
  merged: { label: 'Merged', color: 'text-purple-400' },
  needs_input: { label: 'Needs Input', color: 'text-amber-400' },
  queued: { label: 'Queued', color: 'text-cyan-400' },
  review: { label: 'In Review', color: 'text-teal-400' },
  handed_off: { label: 'Handed Off', color: 'text-orange-300' },
};

export const STATUS_GROUP_ORDER: TicketStatus[] = [
  'needs_input', 'queued', 'handed_off', 'pending', 'creation', 'in_progress', 'review', 'merged',
];
```

### 2. Decompose `WebWorkspaceList.tsx` (502 lines → 4 files)

**a) Extract `apps/web/src/components/CollapsibleStatusGroup.tsx`**
Move the `CollapsibleStatusGroup` function component (current lines 84-128). It takes `status`, `children`, and `count` props. Import `STATUS_CONFIG` from `shared/statusConfig`.

**b) Extract `apps/web/src/components/WorkspaceItem.tsx`**
Move the `WorkspaceItem` memo'd component (current lines 155-203) and its props interface (lines 143-153). Move `PR_STATE_CONFIG` (lines 130-134) into this file as a local constant. Import `STATUS_DOT_COLOR` from `shared/statusConfig`.

**c) Extract `apps/web/src/components/NewWorkspaceModal.tsx`**
Move the modal JSX (current lines 428-498) into its own component. It needs these props:
```ts
interface NewWorkspaceModalProps {
  channelId: string;
  onClose: () => void;
  onCreated: (workspaceId: string) => void;
}
```
Move the modal's local state (`newPrompt`, `creating`, `startImmediately`, `mode`), the `handleCreate` callback, and the `cycleMode` callback into this component. Import `MODE_CONFIG`, `MODE_CYCLE` from `shared/interactionModes`. Import `WebModelEffortSelector`. This component will call `useWorkspaceActions()` and `useAgentRunStore` internally.

**d) Slim down `WebWorkspaceList.tsx`**
After extraction, `WebWorkspaceList.tsx` should only contain:
- The `WebWorkspaceList` component with workspace filtering, grouping (`groupedItems`, `documentItems`), and the render logic
- Imports of `CollapsibleStatusGroup`, `WorkspaceItem`, `NewWorkspaceModal`
- The modal trigger state (`showNewModal`, `setShowNewModal`)

Target: ~150-180 lines.

### 3. Decompose `WebThreadPanel.tsx` (416 lines → 3 files)

**a) Extract `apps/web/src/components/SessionNodeList.tsx`**
Move the `SessionNodeList` memo'd component (current lines 299-400) and its props type. This is already a standalone `React.memo` component — just move it to its own file. It imports from `@trace/shared-ui`.

**b) Extract `apps/web/src/components/ThreadStatusMessage.tsx`**
Move the `ThreadStatusMessage` function (current lines 404-415). This is tiny but extracting it keeps ThreadPanel focused.

**c) Slim down `WebThreadPanel.tsx`**
After extraction, `WebThreadPanel.tsx` should contain:
- The main `WebThreadPanel` component with store subscriptions, scroll logic, plan/question actions
- Imports of `SessionNodeList` and `ThreadStatusMessage`

**Important**: Line 52 of the current `WebThreadPanel.tsx` calls `syncActions.clearSession()`. If Ticket 2 has already been completed, this will need adjustment. If Ticket 2 has NOT been completed yet, keep the `syncActions.clearSession()` call as-is — Ticket 2 will handle it. Add a `// TODO: Replace with direct hook call after syncActions removal` comment if needed.

Target: ~200 lines.

### 4. Decompose `WebThreadInput.tsx` (~470 lines → smaller pieces)

Read `apps/web/src/components/WebThreadInput.tsx` first to understand its structure. Based on the desktop equivalent, it likely contains:
- Main textarea + send button
- Mode toggle (code/plan/ask) — duplicate of the one in workspace list
- Elapsed timer display
- Queue indicator (queued message banner)
- Token usage display
- Slash command menu trigger
- File mention menu trigger
- Image thumbnail display

Extract sub-components based on what you find:

**a) `apps/web/src/components/ElapsedTimer.tsx`** — the running-time display (if it exists as an inline function)

**b) `apps/web/src/components/ModeToggle.tsx`** — the code/plan/ask cycle button. Import from `shared/interactionModes`. This may be shared between the workspace list modal and the thread input.

**c) Any other clearly separable sub-component** that has its own state or is >50 lines.

**d) Slim down `WebThreadInput.tsx`** to the core input logic. Target: <200 lines.

### 5. Deduplicate the `WORKSPACE_FIELDS` GraphQL fragment

**Problem**: `WORKSPACE_FIELDS` is defined in TWO places:
- `apps/web/src/graphql/fragments.ts` (lines 3-33) — includes `permissionMode` in `cliSession`
- `apps/web/src/hooks/useWorkspaceActions.ts` (lines 16-45) — **missing** `permissionMode` field

**Fix**: Remove the duplicate from `useWorkspaceActions.ts` and import from `graphql/fragments.ts`:
```ts
// In useWorkspaceActions.ts, REMOVE the local WORKSPACE_FIELDS definition (lines 16-45)
// REPLACE with:
import { WORKSPACE_FIELDS } from '../graphql/fragments';
```

After this change, run `make web-gql` to regenerate types. Verify all queries using `...WorkspaceFields` still compile.

### 6. Deduplicate `MODE_CYCLE` / `MODE_CONFIG` constants

The interaction mode constants are duplicated between `WebWorkspaceList.tsx` and `WebThreadInput.tsx`. When extracting `NewWorkspaceModal.tsx` (Task 2c) and `ModeToggle.tsx` (Task 4b), **both** must import from the shared file `shared/interactionModes.tsx` created in Task 1. Remove all inline definitions.

After extraction, verify:
```bash
grep -r "MODE_CYCLE\|MODE_CONFIG" apps/web/src/
```
Every hit should be the definition in `shared/interactionModes.tsx` or an import from it.

### 7. Update all imports

After moving components to their own files, update all imports in consuming files:
- `WorkspacePage.tsx` imports `WebWorkspaceList` — no change needed if the export stays the same
- `WorkspacePage.tsx` imports `WebThreadPanel` — no change needed
- Any file importing the extracted sub-components — update paths

Run `grep -r "WebWorkspaceList\|WebThreadPanel\|WebThreadInput" apps/web/src/` to find all consumers.

## Verification

1. `cd apps/web && npx tsc --noEmit` — no type errors
2. `cd apps/web && npx vite build` — production build succeeds
3. `make web-gql` — codegen still works after fragment deduplication
4. Functional test: Open workspace list, verify groups collapse/expand, items render correctly
5. Functional test: Create a new workspace via the modal — works
6. Functional test: Open a thread, verify events render, scroll works, jump-to-latest works
7. Functional test: Send a message, verify plan/question interactive elements work
8. No file >200 lines in the components directory (check with `wc -l apps/web/src/components/*.tsx`)
9. `grep -r "MODE_CYCLE\|MODE_CONFIG" apps/web/src/` — no inline duplicates
10. `grep -r "fragment WorkspaceFields" apps/web/src/` — only one definition in `graphql/fragments.ts`

## Files Changed
- **Created**: `apps/web/src/components/shared/interactionModes.tsx`, `apps/web/src/components/shared/statusConfig.ts`, `apps/web/src/components/CollapsibleStatusGroup.tsx`, `apps/web/src/components/WorkspaceItem.tsx`, `apps/web/src/components/NewWorkspaceModal.tsx`, `apps/web/src/components/SessionNodeList.tsx`, `apps/web/src/components/ThreadStatusMessage.tsx`, `apps/web/src/components/ElapsedTimer.tsx`, `apps/web/src/components/ModeToggle.tsx`
- **Modified**: `apps/web/src/components/WebWorkspaceList.tsx`, `apps/web/src/components/WebThreadPanel.tsx`, `apps/web/src/components/WebThreadInput.tsx`, `apps/web/src/hooks/useWorkspaceActions.ts` (fragment dedup)

## Dependencies
- Independent of Tickets 2 and 3 (purely structural extraction)
- Requires Ticket 1 only if using `@features` path aliases (otherwise can use relative imports)
