# App Session Gap Closure

This plan completes the `app` session kind from `design-session-experience.md` and
`managed-git-hosting.md`. App sessions are standalone cloud-run full-stack app builders:
managed git durability, starter kit, live preview, logs, terminal, checkpoints,
publish/share, and verified working output.

## Current Status Note

This document records the original app-session gap plan. Most listed implementation gaps
have since been closed: app sessions are standalone/cloud-only, use the app starter and
Open Design `appendSystemPrompt`, expose process logs/endpoints/terminal/checkpoints in
the app shell, publish endpoint URLs, lazily create managed repos on first checkpoint,
capture checkpoint thumbnails, restore from checkpoint, and support managed repo
graduation/retention. The current evidence is summarized in
`design-app-session-implementation-audit.md`.

The remaining completion evidence is a hosted end-to-end app smoke:
`pnpm smoke:cloud-app-session` with `TRACE_SMOKE_SERVER_URL`, `TRACE_SMOKE_AUTH_TOKEN`,
and `TRACE_SMOKE_ORG_ID`.

## Target Product Contract

A complete app session must support:

- Prompt-first creation with `kind: app`.
- No user-selected repo at creation.
- Cloud runtime provisioning only.
- Managed git-backed workspace durability.
- Full-stack starter, likely Next.js + Tailwind + shadcn.
- Agent starts the dev server.
- Port detection creates a `SessionEndpoint`.
- Preview pane renders the live app with HMR.
- Logs and terminal are visible.
- Checkpoints are `GitCheckpoint` rows backed by pushed commits.
- Restore by checkpoint.
- Publish/share through endpoint access mode.
- Optional graduation to GitHub or coding session.

## Original Implementation Baseline

Implemented foundations:

- App sessions reject user-linked repos and force cloud hosting.
- App sessions get an app-oriented appended system prompt for Claude Code.
- Current branch work adds managed smart-HTTP git routes and an internal managed repo for
  app sessions.
- Provisioned runtime bootstrap includes `TRACE_SERVER_PUBLIC_URL`.
- The container bridge injects `TRACE_RUNTIME_TOKEN` when cloning Trace-managed git
  remotes.
- Existing process/log/endpoint services can be reused for app sessions.

Remaining verification gap:

- The original implementation gaps above are now covered in the current audit. The final
  app-session completion evidence is a hosted `pnpm smoke:cloud-app-session` run that
  proves a fresh cloud app session boots the starter, renders preview, exposes logs and
  terminal, checkpoints to managed git, restores, captures, publishes, and opens the
  public endpoint.

## Gap 1: Managed Git Needs Production Hardening

Implementation:

1. Finish smart-HTTP protocol support.
   - Keep `GET info/refs`.
   - Keep `POST git-upload-pack`.
   - Keep `POST git-receive-pack`.
   - Add protocol tests with real local `git clone`, commit, push, fetch.

2. Move bare repo storage behind a small adapter.
   - `GitStorageAdapter.repoPath(repoId)`.
   - `GitStorageAdapter.initBareRepo(repoId)`.
   - `GitStorageAdapter.deleteRepo(repoId)`.
   - v1 adapter: filesystem under `GIT_STORAGE_ROOT`.

3. Add authorization modes.
   - Runtime JWT for provisioned runtimes.
   - Short-lived user clone token for local export/clone.
   - Service-layer org/repo checks for every request.

4. Add push observation.
   - After receive-pack, inspect updated refs.
   - Emit `repo_branch_pushed` or session-scoped checkpoint hints if a session owns the
     repo.
   - Keep checkpoint creation driven by bridge parsed commits for now.

5. Add maintenance.
   - Periodic `git gc`.
   - Per-org storage quota check before receive-pack.
   - Retention deletion for archived app groups.
   - Backup/snapshot runbook.

Verification:

- Integration test: create managed repo, clone via smart HTTP, push, fetch.
- Auth test: runtime token for another org/session is rejected.
- Auth test: managed repos are inaccessible without token.
- Quota test: oversized receive-pack is rejected before accepting new refs.

## Gap 2: App Workspace Bootstrap

Implementation:

1. Decide where the starter is applied.
   - Preferred: runtime image contains `/opt/trace/app-starter`.
   - Bridge copies the starter into a newly prepared managed repo worktree when the repo
     only has the seed commit.
   - Agent can then modify a real project instead of scaffolding from zero.

2. Starter contents.
   - Next.js app router.
   - Tailwind configured.
   - shadcn/ui installed and initialized.
   - `trace.tokens.json` or equivalent token file.
   - `data-trace-source` stamping helper or transform.
   - Scripts: `dev`, `build`, `lint`, `typecheck`.

3. Bootstrap detection.
   - Bridge checks for marker file such as `.trace/app-starter.json`.
   - If absent, copy starter, install deps if needed, commit "Initialize app starter", and
     push to managed origin before agent edits.

4. Prompt contract.
   - App prompt tells the agent the starter exists.
   - Agent must run the dev server.
   - Agent must commit meaningful checkpoints.

Verification:

- Container bridge test: empty managed worktree gets starter files.
- Runtime smoke: `pnpm install`, `pnpm dev`, and `pnpm build` work.
- Checkpoint test: initial starter commit is pushed to managed git.

## Gap 3: Live Preview, Logs, and Terminal Shell

Implementation:

1. Reuse existing application process service.
   - Ensure app sessions auto-start the detected dev process.
   - Persist process status and logs in `SessionApplicationProcess` and
     `SessionApplicationLogEntry`.

2. Port detection.
   - Bridge watches listening ports.
   - Denylist internal/system ports.
   - On first app server port, create/enable `SessionEndpoint`.

3. UI shell.
   - App session group view defaults to preview.
   - Secondary tabs: logs, terminal, checkpoints, files if needed.
   - Chat remains available as the command rail.

4. Preview auth.
   - Private endpoints use signed cookie or equivalent endpoint proxy auth.
   - Public publish flips endpoint access mode.

Verification:

- Bridge test: listening port event creates endpoint.
- Service test: endpoint forwarding event updates store.
- Playwright test: app session preview iframe renders the app.
- UI test: logs stream without refetch.

## Gap 4: Checkpoints, Captures, and Restore

Implementation:

1. Checkpoint capture.
   - On `git_checkpoint`, trigger a headless capture of the live app endpoint.
   - Store screenshot/html metadata with `GitCheckpoint` or a related capture entity.

2. Checkpoint UI.
   - Timeline/sidebar list of checkpoints.
   - Show commit subject, time, files changed, capture thumbnail.
   - Restore button starts an app session from `restoreCheckpointId`.

3. Restore behavior.
   - Restore uses the managed repo and checkpoint SHA.
   - Runtime prepare checks out the checkpoint into a new worktree.
   - Dev server restarts from restored state.

4. Rewrite support.
   - Existing checkpoint rewrite handling should continue to update checkpoint rows.
   - Capture records must follow rewritten checkpoints.

Verification:

- Service test: checkpoint capture job is requested after checkpoint event.
- Browser/runtime test: restore checkpoint renders previous app state.
- Git test: restored worktree HEAD equals checkpoint commit SHA.

## Gap 5: Publish and Share

Implementation:

1. Publish v1 is endpoint access.
   - Mutation: `publishAppSession(sessionGroupId)`.
   - Service flips primary endpoint access mode to public.
   - Event carries endpoint URL and access mode.

2. Share UI.
   - Button in app shell.
   - Copy public URL.
   - Show published/unpublished status.

3. Future production deploy.
   - Keep managed repo as source.
   - Add export/deploy provider later.
   - Do not block v1 on production deploy.

Verification:

- Service test: publish requires owner/admin and app session kind.
- Endpoint proxy test: public endpoint works without session auth.
- Browser test: copied published URL renders the app.

## Gap 6: Graduation

Implementation:

1. Open as coding session.
   - Create a coding session linked to the app session group or managed repo.
   - Preserve checkpoint/branch context.

2. Push to GitHub.
   - Create GitHub repo through existing integration.
   - Push `--mirror` from managed bare repo.
   - Flip `Repo.provider` to `github`.
   - Set `remoteUrl`.
   - Retire managed storage after successful mirror and retention window.

Verification:

- Service test: graduation changes provider only after mirror succeeds.
- Git test: GitHub remote has the same refs as managed repo.
- UI test: graduated app appears as a normal coding repo flow.
