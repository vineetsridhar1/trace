# QA plan — repo-optional projects, project sessions, repo linking, PR reconciliation

Covers branch `trace-aardvark-2-project-artifacts` (commits `52a6a42c9`..`87c9f0f1d`).

Environment: web on `:3000`, server on `:4000`, both running the branch HEAD.

## A. Project creation without a repository

| # | Test | Expected |
|---|------|----------|
| A1 | Sidebar `+` → "Create New" chooser | Offers **Project** and **Project Group** |
| A2 | Choose Project | Form shows **only** Project name + Visibility. No repo picker, no base branch, no project type (coding/text), no runtime selector |
| A3 | Create project with a name, no repo | Project is created, dialog closes, new project becomes active |
| A4 | Repo-less project in sidebar | Appears in the project list and is selectable |
| A5 | Open the repo-less project | Renders the project view without erroring on the missing repo |
| A6 | Server accepts `createChannel` with `type: coding` and no `repoId` | No `repoId is required for coding channels` validation error |
| A7 | Create Project Group | Still works (regression) |

## B. Starting sessions from a project

| # | Test | Expected |
|---|------|----------|
| B1 | Project header `+` | **No** coding-tool picker modal (`StartSessionDialog` is deleted). A session is created directly |
| B2 | Session created from project `+` | Kind is `general`, not `coding` |
| B3 | Session on a repo-less project | Creation succeeds; no repo required |
| B4 | Sidebar project row `+` | Same behavior as header `+` (general session) |
| B5 | Project `+` on a repo-attached project | Session inherits the project's `repoId` as context |
| B6 | Header `+` tooltip / aria-label | Reads "New general session (⌘N)" |
| B7 | Double-click `+` rapidly | Only one session is created (in-flight guard) |

## C. Attaching a repository later (UI)

| # | Test | Expected |
|---|------|----------|
| C1 | Right-click a project in the sidebar | Context menu contains **Project repository** |
| C2 | Open Project repository dialog on a repo-less project | Shows "No repository" selected; lists org repos |
| C3 | Org with no repos | Shows hint: "Add a repository in Settings before attaching it to this project." |
| C4 | Select a repository | Base branch combobox appears |
| C5 | Save with repo selected | Dialog closes; project now shows the repo |
| C6 | UI updates without refresh | `channel_updated` event carries the full `repo` object, so Zustand updates live |
| C7 | Reopen dialog | Pre-selects the currently attached repo and base branch |
| C8 | Change repo to a different one via the dialog | Allowed (user-driven change is permitted through `updateChannel`) |
| C9 | Detach (select "No repository") and Save | `repoId` and `baseBranch` both cleared |
| C10 | Attach a repo that belongs to another org | Rejected with `Repo not found` |

## D. Repository inheritance

| # | Test | Expected |
|---|------|----------|
| D1 | Attach repo, then create a session | New general session carries the repo as context |
| D2 | Detach repo, then create a session | Session still created, no repo |

## E. CLI / service invariants (`channel link-repo`)

| # | Test | Expected |
|---|------|----------|
| E1 | Link repo to a channel with none | Succeeds; base branch defaults to repo default branch |
| E2 | `--branch develop` | Uses the supplied branch |
| E3 | Link the **same** repo again | Idempotent success, no error, no duplicate event |
| E4 | Link a **different** repo | `Channel already has a linked repository; detach it before linking another` |
| E5 | Link a repo from another org | `Repo not found` |
| E6 | Concurrent links | Conditional `updateMany` means only one wins; loser errors rather than overwriting |

## F. CLI / service invariants (`repo attach-remote`)

| # | Test | Expected |
|---|------|----------|
| F1 | Attach remote to repo with none | Succeeds; emits `repo_updated` |
| F2 | Attach the **same** URL again | Idempotent success |
| F3 | Attach a **different** URL | `Repository already has a remote URL; remove it before attaching another` |
| F4 | Attach a URL already used by another repo in the org | `Another repository in this organization uses that remote URL` |
| F5 | Empty/whitespace URL | `Remote URL is required` |

## G. Session conversion policy

| # | Test | Expected |
|---|------|----------|
| G1 | `session convert` with no `--kind` | Defaults to `coding` |
| G2 | `session convert --kind coding` on a channel **without** a repo | Fails with the actionable message naming `channel link-repo <channel-id> <repo-id>` |
| G3 | `--repo` flag | No longer accepted (removed from the command surface) |
| G4 | Coding conversion on a channel **with** a repo | Succeeds, creates the worktree |
| G5 | Non-coding conversion (`app`/`design`/`pdf`/`animation`) | Creates an isolated managed workspace; `--channel` rejected |
| G6 | Agent instruction text for general sessions | States coding is automatic, non-coding requires explicit user confirmation |
| G7 | Service-level | Conversion no longer falls back to `sessionGroup.repoId` or an input repo; only `channel.repoId` counts |

## H. PR reconciliation (`session link-pr`)

| # | Test | Expected |
|---|------|----------|
| H1 | Non-HTTPS URL | `The pull request URL must use HTTPS` |
| H2 | Non-GitHub or non-PR URL | `A valid GitHub pull request URL is required` |
| H3 | `/pull/42/files` | Canonicalized to `/pull/42` |
| H4 | Session repo has no remote | Fails listing `repo attach-remote`, then `channel link-repo`, then a retry of `link-pr` |
| H5 | Channel has no linked repo | Remediation includes the `channel link-repo` line |
| H6 | Repo remote points at a different GitHub repo | Hard-fails, refuses to replace |
| H7 | SSH remote vs HTTPS PR URL for the same repo | Treated as matching |
| H8 | Channel repo ≠ session repo | `Resolve the mismatch before linking the PR` |
| H9 | Fully associated session | PR links successfully |

## I. Regressions to confirm still work

| # | Test | Expected |
|---|------|----------|
| I1 | Top-level Design creation | Still creates a standalone design session |
| I2 | Top-level App / PDF / Animation creation | Unchanged |
| I3 | Existing coding sessions in a repo-backed project | Unaffected |
| I4 | ⌘N shortcut | Still creates a session |

---

## Results — executed 2026-08-17 against local web `:3000` / server `:4000` (branch HEAD `87c9f0f1d`)

UI tests were driven through Chrome; service-layer invariants were exercised against the same
running server through its authenticated GraphQL endpoint. The installed CLI (`$TRACE_CLI`) points
at production, so CLI behavior was verified through the branch's own runtime bundle
(`node runtime/bin/trace.mjs`) for help/parsing only — no production mutations were run.

**53 checks executed: 51 pass, 2 defects. Both defects have since been fixed and re-verified.**

| Group | Result |
|-------|--------|
| A. Repo-optional project creation | A1–A7 pass |
| B. Project sessions | B1–B6 pass; B7 not exercised (guard verified by code only) |
| C. Attach repo later | C1, C2, C4, C6–C10 pass; **C5 defect** (base branch not persisted); C3 not reachable (org has repos) |
| D. Repo inheritance | D1, D2 pass |
| E. `linkChannelRepo` | E1–E5 pass; E6 (true concurrency) not exercised |
| F. `attachRepoRemote` | F1–F5 pass |
| G. Conversion policy | G1–G7 pass |
| H. PR reconciliation | H1–H9 pass |
| I. Regressions | I1–I3 pass; **I4 defect** (⌘N label) |

### Defect 1 — Project repository dialog never persists the base branch

`AttachProjectRepoDialog` seeds `branch` from `currentBranch ?? ""` and resets it to `""` whenever a
repository is picked. `BranchCombobox` renders `value || defaultBranch || "main"`, so the dialog
*displays* `main` while its state is still empty, and submit sends
`baseBranch: repoId ? branch || null : null` → `null`.

Observed: selecting `healthcare` (default branch `main`) and saving produced
`{ repo: healthcare, baseBranch: null }`.

This also makes the two attach paths disagree — `linkChannelRepo` explicitly defaults to
`repo.defaultBranch` (verified: E1 returned `baseBranch: "main"`), the dialog does not.

**Fixed.** `AttachProjectRepoDialog` now reads the selected repo's `defaultBranch` and submits
`branch || selectedRepoDefaultBranch || null`, so it persists the value it displays. Re-verified in
the browser: resetting `qa-branch` to no repo, then picking `healthcare` and saving without
touching the branch field now yields `{ repo: healthcare, baseBranch: "main" }`. The detach path is
unchanged (`repoId` empty still clears both fields).

### Defect 2 — `⌘N` does not do what the new button advertises

`StartProjectSessionButton` uses `aria-label="New session (⌘N)"` and tooltip
`New general session (⌘N)`, but `App.tsx:118` handles ⌘N by clearing the active channel and
focusing the Home composer — it never creates a session in the current project.

The label predates this PR (carried over from the deleted `StartSessionDialog`), but the PR
restates it more specifically.

**Fixed** by dropping the `(⌘N)` hint — the button is now labelled `New general session`. Global
⌘N behaviour was left alone: opening Home and focusing the universal composer is deliberate
(documented in the comment above `App.tsx:116`), so rebinding it would be a product change rather
than a bug fix.

### Notable passes

- Full headline flow verified end to end: repo-less project → attach repo later → general session →
  convert to coding (group became `kind: coding`, repo `healthcare`, branch `trace-moth`).
- Conversion cannot be bypassed: supplying an explicit `repoId` to a channel with no linked repo
  still fails with the actionable message (G7).
- The PR association loop works: `link-pr` reported the missing remote and channel association;
  attaching verified values made the retry succeed, and `/pull/42/files` was canonicalized to
  `/pull/42`.
- SSH remote `git@github.com:Acme/SshRepo.git` correctly matched PR URL
  `https://github.com/acme/sshrepo/pull/7` (case-insensitive).
- `channel_updated` carries the full `repo` object, so the dialog reflected the new repository with
  no page refresh.

### Test data left behind (local dev org `trace`) — not auto-deleted

Channels: `qa-no-repo`, `qa-no-remote`, `qa-dup-remote`, `qa-pr`, `qa-ssh`, `qa-ssh-proj`,
`qa-branch`. Repos: `qa-ssh`, `qa-dup-remote`, `qa-no-remote`. Channel group: `QA Group`.
(Creating a repo also auto-creates a channel of the same name.)
