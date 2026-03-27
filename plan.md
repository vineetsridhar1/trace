# Defer worktree creation until first message

## Problem
When Cmd+N creates a session (no prompt), `startSession()` immediately calls `sessionRouter.createRuntime()` which provisions a worktree. This is wasteful — the user hasn't typed anything yet and may change runtime/tool/model before sending.

## Plan

### 1. `startSession()` — skip runtime provisioning when no prompt
In `session.ts` around line 972, gate `createRuntime()` on having a prompt:

```ts
if (needsRuntimeProvisioning && input.prompt) {
  sessionRouter.createRuntime({ ... });
}
```

The session sits as `not_started` with no workdir until the user sends a message.

### 2. `run()` — provision runtime when first message arrives
In `session.ts` around line 1034, when `not_started && !session.workdir`, trigger runtime provisioning before queuing `pendingRun`. Need to fetch repo info and call `sessionRouter.createRuntime()`.

### 3. `sendMessage()` — same deferred provisioning
In `sendMessage()`, add the same check: if `not_started && !session.workdir`, provision the runtime, queue the message as a pending command, and return early.

### Files changed
- `apps/server/src/services/session.ts` only
