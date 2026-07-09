# Managed Git Hosting & Non-Coding Session Kinds

Status: design exploration (2026-07-08). Decision: Trace hosts its own git provider for
projects that shouldn't require an external GitHub repo (starting with `app`-kind
sessions — the standalone app builder; the `design` kind stores artifacts, not git, see
`design-session-experience.md`).

## Problem

Today every session group assumes a GitHub-backed `Repo`. GitHub is not just the source of
truth — it is the **durability layer**: cloud runtimes are ephemeral Fly machines
(`restart.policy: "no"`), the worktree lives only on the machine, and `GitCheckpoint` rows
store only commit SHAs. A workspace survives solely because the agent pushes to the remote.

For a standalone `app` session ("prompt your way to a running app, see it render live"),
forcing repo creation in the user's GitHub is wrong: random experiments would litter their
account, and the create-a-repo ceremony kills the "just start prompting" flow. But without
*some* remote, the project dies with the machine.

## Decision

Trace runs a **managed git remote**: a git smart-HTTP endpoint backed by bare repos on
durable storage. App projects push there. The repo becomes invisible plumbing — the
user-facing object is the project/session, not the repo.

Why git (vs. workspace tarballs or persistent volumes): every piece of existing session
machinery is git-native — checkpoints, branch diffs, worktrees, session-group forking,
restore-from-checkpoint, the container bridge's clone-on-boot (`TRACE_REPO_URL`). Swapping
the remote preserves all of it unchanged; snapshots or volumes would force rebuilding
versioning, forking, and diffing from scratch.

## Architecture

### Repo provider discriminator

```prisma
enum RepoProvider {
  github
  managed
}

model Repo {
  provider  RepoProvider @default(github)
  remoteUrl String?      // null for managed repos
  ...
}
```

- GitHub-specific machinery (`webhookId`/`webhookSecret`, PR sync, `prUrl`) gates on
  `provider === "github"`.
- Managed repos are **hidden from repo lists and pickers** (filter by provider). They are
  storage, not a user-facing entity.
- Mirror the enum in `schema.graphql` (`RepoProvider`) via codegen — no duplicated types.

### Git smart-HTTP service

- Express routes on the server: `GET/POST /git/:orgId/:repoId.git/(info/refs|git-upload-pack|git-receive-pack)`.
- Implementation: spawn `git upload-pack --stateless-rpc` / `git receive-pack --stateless-rpc`
  against a bare repo directory. The smart-HTTP protocol is small and stable; no Gitea/Gitlab
  dependency, consistent with the no-vendor-deps rule.
- Auth: HTTP basic where the password is a token.
  - Runtimes authenticate with the existing scoped runtime JWT
    (`tokenType: "provisioned_runtime"`) — already minted per session and injected as
    `TRACE_RUNTIME_TOKEN`.
  - Users authenticate with a short-lived token minted by the service layer (for local
    clone / export).
  - Authorization goes through the service layer: org membership + repo access, same rules
    as any other service method.
- Push events: a `post-receive` equivalent (inspect the receive-pack result) lets the
  service layer append events (e.g. `repo_branch_pushed`) so checkpoint/diff state updates
  flow through the normal event stream.

#### Smart-HTTP implementation contract

This is one of the known remaining gaps. The managed-git target is not complete until
Trace can clone/fetch/push managed repos over git smart-HTTP.

- **Routes**:
  - `GET /git/:orgId/:repoId.git/info/refs?service=git-upload-pack`
  - `GET /git/:orgId/:repoId.git/info/refs?service=git-receive-pack`
  - `POST /git/:orgId/:repoId.git/git-upload-pack`
  - `POST /git/:orgId/:repoId.git/git-receive-pack`
- **Process execution**: route handlers validate/auth through the service layer, resolve
  the bare repo path from `repoId`, and spawn the matching git command in stateless-RPC
  mode. Do not shell-concatenate untrusted path values; construct paths from validated ids.
- **Content types**: responses must use the smart-HTTP content types
  (`application/x-git-upload-pack-advertisement`,
  `application/x-git-upload-pack-result`,
  `application/x-git-receive-pack-advertisement`,
  `application/x-git-receive-pack-result`) and packet-line framing expected by git.
- **Receive-pack side effects**: after successful pushes, inspect updated refs and call a
  service method that appends the relevant events. The route itself remains transport
  plumbing; business logic stays in services.
- **Auth tokens**: runtime tokens must be scoped to the org/session/repo and expire with
  the runtime. User clone/export tokens must be short-lived and auditable.
- **Verification**: an integration test should initialize a managed bare repo, clone it
  through the HTTP route, commit locally, push through `git-receive-pack`, fetch through
  `git-upload-pack`, and assert service-layer events/refs updated.

### Storage

Bare repos live under a single root (`GIT_STORAGE_ROOT`), one directory per repo id.
This introduces state into the otherwise stateless server deploy:

- **v1**: durable volume mounted into the server task (EBS/EFS on the ECS deploy). Single
  writer, no coordination needed.
- **Later, if needed**: split the git endpoint into its own small service next to the
  launcher, or object-storage-backed repos. The route boundary (`/git/*`) and a
  `GitStorageAdapter`-shaped seam keep this swappable.

Maintenance: periodic `git gc` per repo; per-org storage quota checks on receive-pack.

### Lifecycle: lazy, disposable, graduatable

- **Lazy creation.** Starting an app session creates no repo. The scaffold happens on the
  ephemeral machine. On the **first checkpoint**, the service layer creates the managed
  `Repo` row + `git init --bare`, and the bridge adds it as `origin` and pushes. Abandoned
  sessions persist nothing.
- **Disposable.** Archiving an app project starts a retention clock; after N days the
  bare repo is GC'd. (Impossible with repos created in a user's GitHub — the core reason
  managed hosting exists.)
- **Graduation.** "Push to GitHub" is an explicit user action: create the GH repo via the
  existing GitHub integration, `git push --mirror` from the managed bare repo, flip
  `provider` to `github`, set `remoteUrl`, retire the managed copy. All PR/webhook machinery
  lights up from that point.

#### Lazy app checkpoint implementation contract

This is one of the known remaining gaps. App sessions may start without a repo, but the
first checkpoint must make them durable.

- **Before first checkpoint**: `SessionGroup.kind === "app"` may have no `repoId` and no
  remote. The runtime worktree is still a normal git worktree locally so diffs/checkpoint
  creation can operate.
- **First checkpoint service flow**:
  1. Detect that the app session group has no repo.
  2. Create a hidden `Repo { provider: managed }` row scoped to the org.
  3. Create the bare repo directory under `GIT_STORAGE_ROOT` with `git init --bare`.
  4. Mint or reuse a runtime-scoped token for that repo.
  5. Ask the bridge/runtime to add the managed remote as `origin` or update the existing
     origin to the managed URL.
  6. Commit the checkpoint locally if needed and push the checkpoint branch/ref to the
     managed remote.
  7. Persist the repo link on the `SessionGroup`, create the `GitCheckpoint`, append the
     normal checkpoint events, and broadcast state through subscriptions.
- **Idempotency**: retries must not create multiple managed repos for the same session
  group. If repo creation succeeded but push failed, the next retry should reuse the same
  repo and continue.
- **Later checkpoints**: skip repo creation and push to the existing managed remote.
- **Abandoned sessions**: if no checkpoint was ever created, no managed repo exists and
  nothing needs GC beyond runtime cleanup.
- **Verification**: tests should prove an app session starts without `repoId`, first
  checkpoint creates exactly one managed repo and pushes to it, retry is idempotent, and
  later checkpoint/restore flows use the managed remote.

### Runtime integration

Almost nothing changes on the runtime side:

- `TRACE_REPO_URL` points at the managed clone URL with the runtime token embedded
  (`https://x-token:<jwt>@server/git/<org>/<repo>.git`). The container bridge's existing
  clone/checkout path (`apps/container-bridge/src/workspace.ts`) works as-is.
- Checkpoint pushes go to the managed remote exactly as they go to GitHub today.
- Local (Electron bridge) sessions can use the same URL with a user token.

## Session kinds (follow-on)

`SessionGroup.kind: coding | design | app` selects the UI shell and creation flow.
**Managed git hosting is motivated by the `app` kind**: a standalone app builder
(full-stack starter, likely Next.js + Tailwind + shadcn, on a cloud runtime; dev server
picked up via listening-port detection → auto-enabled `SessionEndpoint` → iframe
preview), standalone (no `repoId` at creation), getting its managed repo lazily at the
first checkpoint. The `design` kind (project design canvas) runs **no runtime and no repo
at all** — artifacts are entities in object storage with lineage rows, generated via the
`LLMAdapter`, and primarily promote into coding sessions for project implementation.
Detailed in `design-session-experience.md`.

## Open questions

1. **Server-hosted vs. sidecar git service from day one.** v1 recommendation is in-server
   with a mounted volume; revisit if the server needs to scale horizontally (receive-pack
   requires a single consistent writer per repo, so horizontal scale forces either sticky
   routing on repo id or the sidecar split).
2. **Backup story.** Bare repos on a volume need snapshots or a nightly mirror to object
   storage.
3. **Retention defaults.** How long archived app projects keep their managed repo before GC.
4. **Quotas.** Per-org storage caps and max repo size on receive-pack.

## Full implementation acceptance

Managed git is complete for the app-session target only when:

- `RepoProvider.managed` exists in Prisma and GraphQL via codegen, with no duplicate local
  enum definitions.
- Managed repos are hidden from normal repo pickers/lists but visible to service-layer
  session/checkpoint code.
- Smart-HTTP clone/fetch/push works against bare repos under `GIT_STORAGE_ROOT`.
- Runtime and user git auth tokens are scoped, short-lived where appropriate, and checked
  through services.
- App sessions lazily create and push to a managed repo on first checkpoint.
- Archive/retention cleanup can delete managed bare repos after the configured window.
