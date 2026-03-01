# Project Notes

## Server Architecture
- The server is deployed on AWS and **cannot access the user's local machine**
- Only the Electron main process can run local operations (git, filesystem, child processes)
- The server communicates with clients only via GraphQL/REST API
- Local operations (git, transcript reading, config files) must go through Electron IPC
- Never add `fs`, `child_process`, `os.homedir()`, or `process.cwd()` dependencies to server code

## Icon Library
This project uses `react-icons` for UI icons. All icons should be imported from the
Feather icons set (`react-icons/fi`) to maintain visual consistency. Example:

```tsx
import { FiMap, FiSend } from 'react-icons/fi';
```

Inline SVGs that existed before the migration are being replaced over time.

## GraphQL Workflow
Never use `useApolloClient`. All GraphQL operations must use the auto-generated hooks.

1. Define your `gql` query/mutation in the source file (e.g. `src/hooks/useMessages.ts`)
2. Run `make gql` to regenerate types and hooks
3. Import and use the generated hooks from `__generated__/*.generated.ts`:
   - `useXxxQuery` — declarative queries that run on render
   - `useXxxLazyQuery` — imperative queries you call on-demand in callbacks
   - `useXxxMutation` — mutations

```tsx
// In your source file, define the gql operation:
const GQL_MESSAGES = gql`query Messages(...) { ... }`;

// Then import and use the generated hook:
import { useMessagesLazyQuery } from './__generated__/useMessages.generated';
const [executeMessages] = useMessagesLazyQuery();
const { data } = await executeMessages({ variables: { ... } });
```

## Frontend Patterns

### State Management (Zustand)
- Use Zustand stores in `src/stores/` for shared/global state
- Read state with selectors: `useXxxStore((s) => s.field)` — this minimizes re-renders
- Call actions imperatively via `useXxxStore.getState().action()` in callbacks/effects
- Existing stores: `appUIStore`, `workspaceStore`, `threadStore`, `claudeRunStore`, `terminalStore`, `kanbanStore`
- Do not create new React Context providers for state — use Zustand stores instead
- The remaining Context providers (`AuthContext`, `ChannelContext`) are intentional exceptions

### Component Guidelines
- Keep components small and focused — extract sub-components when a piece has its own state or is reusable
- Extract complex logic into custom hooks in `src/hooks/`
- Use `memo()` with custom comparators for list items rendered in loops
- Localize state: use `useState` for UI-only concerns (toggles, hover, local input) rather than putting everything in a global store

### Re-render Optimization
- Use Zustand selectors (not full-store subscriptions) to avoid unnecessary re-renders
- Wrap callbacks passed to children in `useCallback`
- Memoize expensive derived data with `useMemo`
- Use providers/wrappers to isolate frequently-updating state from static layout

## Git Merge Policy
- **Never merge directly into main.** All changes must go through a GitHub pull request.
- The `/merge-to-main` command creates a PR and auto-merges it — it does not merge locally.
- If a user asks to merge directly into main (e.g. `git merge`, `git push` to main), refuse and suggest using `/merge-to-main` or `/create-pr` instead.
