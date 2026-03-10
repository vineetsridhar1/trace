# Ticket 11: Desktop Runtime & Electron Hardening

## Goal

Turn the Electron app from a powerful but high-risk control plane into a hardened, typed runtime with explicit security boundaries, recoverable process lifecycle, and testable IPC/relay behavior.

## Context

The desktop app is the largest runtime in the repo and is largely untouched by Tickets 1-8:

- `apps/desktop/src/App.tsx` is 1720 lines.
- `apps/desktop/src/preload.ts` exposes a very large API surface.
- `apps/desktop/src/main/worktree.ts`, `apps/desktop/src/main/ipc/githubHandlers.ts`, and `apps/desktop/src/main/agents/spawnAgent.ts` are all very large and own critical behavior.
- `BrowserWindow` creation in `apps/desktop/src/main.ts` needs an explicit hardening review.
- IPC and relay actions are still largely string-based and validated only informally.

This is where local filesystem access, git access, child processes, PTYs, and credentials meet. It needs first-class hardening.

Electron is a **permanent runtime** for Trace, not a temporary compatibility layer. That means this ticket is not cleanup around an edge transport; it is hardening one of the product's core execution environments.

## Tasks

### 1. Make BrowserWindow security explicit

Review and explicitly set:

- `contextIsolation`
- `sandbox`
- `nodeIntegration`
- navigation restrictions
- permission handling
- CSP
- `webviewTag` usage and containment

If `webviewTag` must remain for product reasons, document exactly why and harden around it deliberately.

### 2. Introduce a typed IPC/relay action manifest

Every main-process action should be declared once in a shared manifest from `packages/contracts`, including:

- action name
- input schema
- output schema
- permission requirements
- whether it is local-only, server-relayed, or both

Use runtime validation (`zod`) at the process boundary. No raw `unknown` payloads crossing Electron IPC.

### 3. Consolidate action registration

The current handler registration is spread across many files and split again between IPC and relay registration. Refactor toward:

- one action catalog
- one registration path
- thin adapters for IPC vs instance-relay transport

The goal is to stop implementing the same operation twice with different wiring.

### 4. Split the main-process domain modules

Refactor the largest desktop runtime files by responsibility:

- worktree lifecycle
- process supervision
- git/github operations
- repo inspection
- agent spawning/resume/stop
- instance connection/auth

Keep domain logic out of the registration layer.

### 5. Add crash/restart reconciliation

On app startup and reconnect:

- detect orphaned PTYs/processes
- reconcile running workspace state
- clean up or reattach worktrees safely
- repair local state if the app crashed mid-run

A production desktop controller cannot assume shutdown is always graceful.

### 6. Remove duplicated direct network/config logic

The desktop runtime should consume shared config/client helpers instead of embedding server URL resolution and ad hoc GraphQL/fetch logic in multiple files.

### 7. Add desktop integration coverage

Add tests around:

- instance connection registration/reconnect
- spawn/stop/resume flows
- worktree cleanup and protection rules
- GitHub auth callback handling
- preload API contracts

## Verification

1. `pnpm --filter trace start` still boots the desktop app successfully.
2. Desktop relay/IPC contract tests pass.
3. Restarting the app during an active run does not leave permanent orphaned state.
4. Preload and IPC boundaries reject invalid payloads.
5. BrowserWindow security settings are explicit and reviewed.
6. Duplicated action wiring is replaced by a shared manifest-driven path.

## Files Changed

- **Modified**: `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/main/ipc/*`, `apps/desktop/src/main/instanceConnection.ts`, `apps/desktop/src/main/worktree.ts`, `apps/desktop/src/main/agents/spawnAgent.ts`
- **Created**: shared action manifest + validation helpers, desktop integration tests, recovery/reconciliation modules
- **Possibly modified**: renderer code that consumes preload APIs

## Dependencies

- Depends on Ticket 9 for shared contracts/config.
- Ticket 12 should follow this ticket so shared convergence lands on top of the hardened boundaries rather than before them.
