# Managed Git Hosting & Non-Coding Session Kinds

Status: design exploration (2026-07-08). Decision: Trace hosts its own git provider for
projects that shouldn't require an external GitHub repo (starting with web design sessions).

## Problem

Today every session group assumes a GitHub-backed `Repo`. GitHub is not just the source of
truth — it is the **durability layer**: cloud runtimes are ephemeral Fly machines
(`restart.policy: "no"`), the worktree lives only on the machine, and `GitCheckpoint` rows
store only commit SHAs. A workspace survives solely because the agent pushes to the remote.

For a Replit-style design session ("prompt your way to an app, see it render live"), forcing
repo creation in the user's GitHub is wrong: random experiments would litter their account,
and the create-a-repo ceremony kills the "just start prompting" flow. But without *some*
remote, the project dies with the machine.

## Decision

Trace runs a **managed git remote**: a git smart-HTTP endpoint backed by bare repos on
durable storage. Design projects push there. The repo becomes invisible plumbing — the
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

- **Lazy creation.** Starting a design session creates no repo. The scaffold happens on the
  ephemeral machine. On the **first checkpoint**, the service layer creates the managed
  `Repo` row + `git init --bare`, and the bridge adds it as `origin` and pushes. Abandoned
  sessions persist nothing.
- **Disposable.** Archiving a design project starts a retention clock; after N days the
  bare repo is GC'd. (Impossible with repos created in a user's GitHub — the core reason
  managed hosting exists.)
- **Graduation.** "Push to GitHub" is an explicit user action: create the GH repo via the
  existing GitHub integration, `git push --mirror` from the managed bare repo, flip
  `provider` to `github`, set `remoteUrl`, retire the managed copy. All PR/webhook machinery
  lights up from that point.

### Runtime integration

Almost nothing changes on the runtime side:

- `TRACE_REPO_URL` points at the managed clone URL with the runtime token embedded
  (`https://x-token:<jwt>@server/git/<org>/<repo>.git`). The container bridge's existing
  clone/checkout path (`apps/container-bridge/src/workspace.ts`) works as-is.
- Checkpoint pushes go to the managed remote exactly as they go to GitHub today.
- Local (Electron bridge) sessions can use the same URL with a user token.

## Session kinds (follow-on)

`SessionGroup.kind: coding | design | app` selects the UI shell and creation flow. The
`design` kind is a Claude-Design-style artifact tool (static HTML screens/decks, every
checkpoint permanently re-renderable, PDF export); the `app` kind is a Replit-style app
builder (React starter, dev server picked up via listening-port detection → auto-enabled
`SessionEndpoint` → iframe preview). Both run cloud-only, are standalone (no `repoId` at
creation, no `setupConfig`/setup scripts — the agent scaffolds from templates in the
runtime image), and get their managed repo lazily at the first checkpoint. Detailed in
`design-session-experience.md`.

## Open questions

1. **Server-hosted vs. sidecar git service from day one.** v1 recommendation is in-server
   with a mounted volume; revisit if the server needs to scale horizontally (receive-pack
   requires a single consistent writer per repo, so horizontal scale forces either sticky
   routing on repo id or the sidecar split).
2. **Backup story.** Bare repos on a volume need snapshots or a nightly mirror to object
   storage.
3. **Retention defaults.** How long archived design projects keep their managed repo before GC.
4. **Quotas.** Per-org storage caps and max repo size on receive-pack.
