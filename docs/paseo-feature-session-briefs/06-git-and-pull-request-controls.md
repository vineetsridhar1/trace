# Session Brief: Rich Git and Pull-Request Controls

## Assignment

Expose a curated, authorized Git and pull-request control surface for Trace session workspaces. Fill
the useful gaps relative to Paseo while preserving Trace's stronger worktree, checkpoint, managed
Git, linked-checkout, service, event, and runtime-placement architecture. Do not expose arbitrary
shell commands or arbitrary repository paths.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Product examples

```sh
trace git status --group "$TRACE_SESSION_GROUP_ID"
trace git diff --group "$TRACE_SESSION_GROUP_ID" --file apps/web/src/App.tsx
trace git commits --group "$TRACE_SESSION_GROUP_ID" --limit 20
trace git commit --group "$TRACE_SESSION_GROUP_ID" -m "Fix empty state"
trace git push --group "$TRACE_SESSION_GROUP_ID"
trace pr create --group "$TRACE_SESSION_GROUP_ID" --title "Fix empty state"
trace pr status --group "$TRACE_SESSION_GROUP_ID"
trace pr checks --group "$TRACE_SESSION_GROUP_ID"
```

## Current Trace context

- `SessionGroup` is the authorized workspace/worktree placement unit.
- `SessionRouter` and runtime bridges already perform worktree status, changes, commits, checkpoints,
  imports, branch diff/file reads, and linked-checkout link/sync/commit/restore operations.
- `apps/server/src/services/managed-git.ts` owns Trace-managed repo storage and scoped access tokens.
- `apps/server/src/services/github-repo.ts` reads GitHub files/diffs; webhook and token services exist.
- GraphQL already exposes branch/worktree/file/diff/checkpoint and linked-checkout operations, but not
  a complete curated Git/PR lifecycle.
- Paseo's broader reference includes status, diff, log, commit, pull/push, merge, branch switch/
  rename, stash, worktree operations, PR create/status/checks/timeline/merge, and automerge.

## Start with an inventory

Before adding code, map each requested operation to existing Trace service, GraphQL, bridge, and UI
support. Reuse and normalize existing operations. Record the inventory in the PR description or a
short checked-in note so reviewers can see what was reused versus added.

## Required MVP

- Read: status, changed files, bounded diff/file diff, bounded commit log, current/base branch, remote
  sync state, and PR status/checks when a PR exists.
- Mutate: commit selected/all workspace changes, fetch/pull or merge-from-base with safe conflict
  reporting, push session branch, create/update a PR, and merge a PR after explicit confirmation.
- Branch switching, rename, stash, extra worktree creation, and automerge are follow-ups unless the
  inventory proves they are already safe primitives requiring only adapter exposure.

## Required design

1. Add or extend a service-layer Git workspace API keyed by `sessionGroupId`, never caller-supplied
   filesystem paths. Resolve runtime/workdir/repo only after membership, visibility, environment, and
   bridge-access authorization.
2. Use narrowly typed `SessionRouter`/bridge messages for local Git operations. Validate arguments;
   avoid constructing shell command strings from user input. Apply timeouts and output limits.
3. Keep forge operations behind a provider-neutral adapter (`ForgeAdapter` or equivalent). GitHub
   implementation details stay in its adapter/service; core GraphQL and CLI types remain generic.
4. Reuse the current user/org GitHub credential policy and managed-Git tokens. Never send central
   provider tokens to a local shell when a server-side forge API can perform the operation.
5. Mutations append service-layer events with actor attribution and enough entity state for clients
   to reconcile. Do not put full diffs, credentials, or sensitive remote output in event payloads.
6. Return structured conflicts/check failures rather than a generic process error. Never auto-force,
   discard changes, rewrite history, delete branches, or merge a PR without an explicit operation.
7. Add thin GraphQL operations, web controls where useful, and CLI commands using session 1's client
   conventions. Human and scoped-agent callers use the same services but must pass authorization.
8. Bound logs, diffs, check lists, and timelines with pagination/truncation metadata.

## Completion criteria

- An authorized caller can inspect status/diff/log, commit, synchronize from base, push, create a PR,
  inspect its checks/status, and explicitly merge it through services and CLI/GraphQL.
- The same operations work for an eligible local runtime and a provisioned runtime through
  `SessionRouter`; unavailable runtimes return actionable errors.
- A caller cannot target another org/group, arbitrary path, unmanaged worktree, or ungranted bridge.
- Dirty-worktree, merge-conflict, non-fast-forward, missing credential, failed checks, already-merged,
  and provider-rate-limit cases are structured and tested.
- Events are emitted for meaningful mutations with actor attribution and no diff/secret leakage.
- Existing checkpoint, linked-checkout, managed-Git, and branch-diff flows continue to pass.
- Adapter/service/router/GraphQL/CLI tests and affected typechecks/builds pass.

## Likely touchpoints

- `apps/server/src/services/session.ts`
- a focused Git workspace service extracted only if current size/ownership requires it
- `apps/server/src/lib/session-router.ts`
- desktop/container bridge Git handlers
- `apps/server/src/services/managed-git.ts`
- `apps/server/src/services/github-repo.ts` and a provider-neutral forge boundary
- `packages/gql/src/schema.graphql`
- Trace CLI Git/PR modules and relevant web controls

Do not implement background orchestration, arbitrary `git` execution, destructive force operations,
or support every Paseo command in this first session.
