# Ticket 5: Performance Foundations

## Goal
Add route-level code splitting with lazy loading, error boundaries around major panels, and prepare the thread event list for virtualization. These are the low-hanging-fruit performance wins that should be built into the foundation.

## Context

### Current problems
1. **No code splitting**: Every page (Login, InstancePicker, Workspace) is eagerly loaded in `App.tsx`. The entire app JS bundle is downloaded upfront.
2. **No error boundaries**: If any component throws during render, the entire app crashes to a white screen.
3. **No virtualization**: The thread event list in `WebThreadPanel.tsx` / `SessionNodeList.tsx` renders every event node as a DOM element. For long sessions (100+ events), this causes visible jank during scroll and when new events arrive.
4. **Heavy deps loaded eagerly**: `shiki` (syntax highlighting), `react-markdown`, diff rendering — all loaded upfront even if the user hasn't opened a thread yet.

### Current `App.tsx` structure
```tsx
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { InstancePickerPage } from './pages/InstancePickerPage';
import { WorkspacePage } from './pages/WorkspacePage';

// All 4 pages are in the main bundle
```

## Tasks

### 1. Add route-level lazy loading to `App.tsx`

**File**: `apps/web/src/App.tsx`

Replace static imports with `React.lazy`:

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstanceProvider } from './context/InstanceContext';
import { ChannelProvider } from './context/ChannelContext';
// If Ticket 3 is done:
// import { RunnerProvider } from './features/runner/RunnerContext';

const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage').then(m => ({ default: m.AuthCallbackPage })));
const InstancePickerPage = lazy(() => import('./pages/InstancePickerPage').then(m => ({ default: m.InstancePickerPage })));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then(m => ({ default: m.WorkspacePage })));
```

Note: The `.then(m => ({ default: m.XXX }))` pattern is needed because these pages use named exports, not default exports. Alternatively, add `export default` to each page file — pick whichever approach is cleaner.

Add a loading fallback component:

```tsx
function PageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-surface">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-accent" />
    </div>
  );
}
```

Wrap routes in `Suspense`:

```tsx
function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageSkeleton />;

  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/*"
          element={!user ? <Navigate to="/login" replace /> : <ProtectedRoutes />}
        />
      </Routes>
    </Suspense>
  );
}
```

### 2. Create ErrorBoundary component

**Create `apps/web/src/components/ErrorBoundary.tsx`**:

```tsx
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-sm font-medium text-red-400">Something went wrong</p>
          <p className="text-xs text-muted">{this.state.error?.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 rounded-md bg-surface-elevated px-3 py-1.5 text-xs text-primary hover:bg-surface-elevated/80"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 3. Wrap major panels in error boundaries

**File**: `apps/web/src/pages/WorkspacePage.tsx`

Wrap each major section:

```tsx
import { ErrorBoundary } from '../components/ErrorBoundary';

// In the render:
<ErrorBoundary>
  <WebWorkspaceList ... />
</ErrorBoundary>

<ErrorBoundary>
  <WebThreadPanel ... />
</ErrorBoundary>

<ErrorBoundary>
  <WebThreadInput ... />
</ErrorBoundary>
```

This ensures that if the thread panel crashes (e.g., bad event data), the workspace list still works and the user can switch to a different workspace.

### 4. Lazy-load the NewWorkspaceModal

If Ticket 4 has been completed and `NewWorkspaceModal` is its own component, lazy-load it:

**In `WebWorkspaceList.tsx`**:
```tsx
const NewWorkspaceModal = lazy(() => import('./NewWorkspaceModal'));

// In render:
{showNewModal && (
  <Suspense fallback={null}>
    <NewWorkspaceModal
      channelId={channelId}
      onClose={() => setShowNewModal(false)}
      onCreated={onSelectWorkspace}
    />
  </Suspense>
)}
```

If Ticket 4 hasn't been done yet, skip this step.

### 5. Lazy-load the WorktreeChanges tab

The changes/diff tab (`WebWorktreeChanges.tsx`) likely imports diff-rendering libraries. Lazy-load it in `WorkspacePage.tsx`:

```tsx
const WebWorktreeChanges = lazy(() => import('../components/WebWorktreeChanges').then(m => ({ default: m.WebWorktreeChanges })));

// In the tab rendering:
{activeTab === 'changes' && (
  <Suspense fallback={<div className="p-4 text-xs text-muted">Loading diff...</div>}>
    <WebWorktreeChanges ... />
  </Suspense>
)}
```

### 6. Install `@tanstack/react-virtual` (prep for virtualization)

```bash
cd apps/web && pnpm add @tanstack/react-virtual
```

**Do NOT implement virtualization yet** — that requires careful work with variable-height items, scroll position restoration, and auto-scroll-to-bottom logic. This ticket just installs the dependency and documents where it will be used.

Add a comment in `SessionNodeList.tsx` (or `WebThreadPanel.tsx` if Ticket 4 hasn't extracted it):

```tsx
// TODO: Virtualize this list using @tanstack/react-virtual for sessions with 100+ events.
// Key challenges:
// 1. Variable height items (assistant text, tool calls, diffs, plan review)
// 2. Auto-scroll to bottom on new events (nearBottomRef logic)
// 3. "Load older events" prepend (scroll position must be preserved)
// 4. estimateSize needs per-node-kind heuristics
```

### 7. Batch subscription state updates

**File**: `apps/web/src/hooks/useChannelSubscriptions.ts`

The subscription effects currently call multiple `useXxxStore.getState().setXxx()` calls in sequence. Each one triggers a separate Zustand update and React re-render. Batch them using `ReactDOM.unstable_batchedUpdates` or, since React 18+ auto-batches in event handlers, ensure these are in effects that React batches.

Actually, React 18 auto-batches state updates in `useEffect`, so this is likely already batched. But verify by checking the thread panel re-render count in React DevTools when a subscription event arrives.

If re-renders are excessive, the fix is to combine multiple `set()` calls into a single store update. For example, in `useChannelSubscriptions.ts` lines 96-121, the workspace upserted handler calls:
```ts
storeState.upsertWorkspace(workspace);                    // triggers render
useThreadStore.getState().syncSelectedWorkspace(workspace); // triggers render
useAgentRunStore.getState().clearPendingRun();             // triggers render
```

These could be combined if they cause visible jank. But measure first — don't optimize blindly.

## Verification

1. `cd apps/web && npx tsc --noEmit` — no type errors
2. `cd apps/web && npx vite build` — production build succeeds
3. **Check chunk splitting**: After build, look at `apps/web/dist/assets/` — there should be separate chunks for LoginPage, InstancePickerPage, WorkspacePage (not all in one file)
4. **Verify lazy loading**: Open browser DevTools Network tab. Navigate to `/login` — only the login chunk should load. Navigate to `/` — instance picker chunk loads. Connect to instance — workspace chunk loads.
5. **Verify error boundary**: Temporarily throw an error in `WebThreadPanel` render. The workspace list should still work; the thread panel should show the error fallback with "Try again" button.
6. **Verify app works**: Login, connect to instance, view workspaces, open thread, send message — all functional.
7. Verify `@tanstack/react-virtual` is in `package.json` but not yet imported anywhere (just installed for next phase).

## Files Changed
- **Created**: `apps/web/src/components/ErrorBoundary.tsx`
- **Modified**: `apps/web/src/App.tsx` (lazy routes + Suspense), `apps/web/src/pages/WorkspacePage.tsx` (error boundaries + lazy changes tab), possibly `apps/web/src/components/WebWorkspaceList.tsx` (lazy modal)
- **Modified**: `apps/web/package.json` (`@tanstack/react-virtual` added)

## Dependencies
- Independent of Tickets 2 and 3
- Ticket 4 (component decomposition) makes the lazy-loading of modals easier, but this ticket works without it
