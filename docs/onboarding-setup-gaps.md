# Trace Onboarding Setup Gaps

## Purpose

Trace already has the core primitives for invite-based organization access, repository linking, desktop bridge registration, channels, sessions, API tokens, and repo hooks. The missing piece is a setup path that makes the actual dependency chain clear before a user tries to start their first coding session.

This document lists the current gaps and the additions that would make first-run setup reliable.

## Current State

- Users without an organization currently see a welcome screen with self-serve organization creation, but the initial rollout should be invite-only.
- Authenticated users with an organization see a lightweight home checklist.
- The checklist currently tracks three outcomes:
  - at least one repository exists
  - at least one channel exists
  - at least one session exists
- Repository creation can detect local git metadata in the desktop app.
- Desktop repo path linking exists in repository settings.
- Git hooks can be enabled or repaired per linked local repository.
- GitHub webhook registration uses a stored GitHub API token.
- Local session creation requires a connected local runtime and, for repo-backed channels, a runtime that has the repo linked.

## Key Gaps

### 1. Runtime readiness is not part of onboarding

Starting a local coding session depends on a connected desktop bridge/runtime. Today this is only discovered when session creation fails.

Add an onboarding step that shows:

- whether the desktop app/bridge is connected
- bridge name
- supported coding tools
- whether the selected repo is available on that bridge
- a direct path to fix missing bridge setup

Success criteria:

- A user can tell before creating a session whether Trace can run local agents on this machine.
- The first-session action should never fail with only `No connected local runtime available` unless the user bypassed the setup path.

### 2. Invite-only organization access is not reflected in onboarding

The initial Trace rollout is invite-only. Users should not be able to create organizations until they already belong to one or have been explicitly granted that capability.

Update the no-organization state:

- remove self-serve organization creation from the initial invite-only flow
- show that the account is waiting for an organization invite
- make the signed-in email easy to copy for admins
- provide a `Check again` action that refreshes membership
- keep sign-out available

Success criteria:

- A user with no memberships cannot create an organization during the invite-only phase.
- The no-org screen clearly explains that an admin must invite them.
- Once invited, refreshing membership takes the user into the normal authenticated app.

### 3. Repository record and local repo access are conflated

Trace can create a repository record without proving the local machine can access it. For local coding, repo existence is not enough; the desktop bridge must also know the local path.

Add a separate onboarding item:

- `Connect a repository`
- `Link this repository on this computer`

The second step should use the existing desktop `pickFolder`, `getGitInfo`, and `saveRepoPath` APIs.

Success criteria:

- The user can see whether a repo exists in the organization.
- The user can see whether that repo is linked on the current desktop bridge.
- Coding-channel creation should warn when the chosen repo is not linked on any connected local runtime.

### 4. GitHub CLI access is not checked

Trace installs `gh` in the cloud/container runtime image, but there is no product-level check for GitHub CLI authentication. Local desktop agents may also depend on the user's local `gh` auth.

Add a GitHub CLI setup capability:

- detect whether `gh` is installed
- run `gh auth status --hostname github.com`
- show the authenticated GitHub login when ready
- provide a guided terminal fallback for `gh auth login` on local desktop runtimes
- re-check status after the terminal exits or the window regains focus

Success criteria:

- A user can see whether `gh` is ready before asking agents to create PRs, inspect CI, or use GitHub issue/PR commands.
- Missing CLI auth should produce a setup action, not a late agent failure.

Product guidance:

- Do not make an interactive terminal the primary GitHub login path.
- Use GitHub OAuth/device flow for Trace's first-party GitHub identity.
- Use `gh auth status` as a readiness check for runtime shell workflows.
- Offer `gh auth login` in a terminal only when the user needs local shell-level GitHub access and the current desktop runtime is missing it.
- Avoid putting browser-only or cloud-only users through a local terminal flow they cannot complete.

### 5. GitHub API identity and GitHub CLI identity are separate

Trace currently uses a stored GitHub API token for webhook registration. That does not imply `gh` is installed or authenticated. Conversely, `gh auth` does not automatically configure the server-side token used by Trace webhooks.

Make the distinction explicit in settings and onboarding:

- GitHub app identity: server-side GitHub API operations such as webhook registration.
- GitHub CLI auth: shell-level operations used by local/cloud coding agents.
- Manual GitHub API token: fallback path if GitHub app identity is unavailable.

Success criteria:

- Settings should not imply that adding a GitHub app identity or API token makes CLI operations work.
- GitHub CLI setup should not imply that webhook registration will work.

Recommended direction:

- Prefer a GitHub OAuth/device-flow identity over asking users to paste a personal access token.
- Store the OAuth token securely and use it for server-side GitHub API calls.
- Keep `gh auth` as a separate local/runtime readiness check for agent shell workflows.
- Keep manual API token entry only as a fallback or admin/debug escape hatch.

Why `gh auth` is not enough:

- `gh auth` lives on a specific machine or runtime.
- Server-side webhooks and background jobs cannot rely on a user's local `gh` config.
- Browser-only users may not have a local `gh` installation.
- Cloud/container runtimes may have their own filesystem and auth state.
- Product-owned API calls need a stable token available to the Trace service layer.
- An interactive terminal flow does not map cleanly to browser-only setup or server-side background work.

Why OAuth is better than manual API keys:

- Users do not need to create and paste personal access tokens.
- Trace can request explicit scopes during login.
- Trace can show the connected GitHub account.
- Trace can support refresh and disconnect flows.
- Trace can make GitHub setup feel like first-party auth instead of settings plumbing.

### 6. API token setup is incomplete in the web UI

The server supports multiple token providers, including `anthropic`, `openai`, `github`, and `ssh_key`. The current settings UI only exposes GitHub metadata.

Add UI rows for all supported token providers or intentionally hide unsupported providers behind a feature flag.

Success criteria:

- The visible API key settings match the providers returned by `myApiTokens`.
- LLM provider setup has a clear path before agent features that require those keys are used.

### 7. Repo hook setup is buried

Repo hooks already exist, but they live inside repository settings after local path linking. They are important enough to surface during setup because they affect local repo synchronization and state tracking.

Add an optional onboarding item:

- enable repo hooks
- show hook status
- repair hooks when broken

Success criteria:

- Hook setup is visible immediately after local repo path linking.
- Hook failures are recoverable from the onboarding surface.

### 8. First session creation does not guide recovery

The first-session checklist action currently attempts to create a session and shows a toast on failure. Setup failures should route users to the missing prerequisite.

Add failure-aware routing:

- no runtime connected -> runtime setup step
- repo not linked on runtime -> local repo link step
- missing GitHub CLI auth -> GitHub CLI setup step when the requested workflow needs GitHub
- missing provider token -> API key setup step when cloud/LLM feature requires it

Success criteria:

- First-session creation errors are actionable.
- Each blocking error has one obvious setup destination.

## Recommended Onboarding Checklist

Use capability-based setup rather than a one-time wizard that permanently disappears.

Recommended items:

1. Accept an organization invite.
2. Connect this desktop bridge.
3. Connect a repository to the organization.
4. Link the repository on this computer.
5. Optional: enable repo hooks.
6. Optional: connect GitHub app identity.
7. Optional: authenticate GitHub CLI.
8. Optional: configure LLM/API provider keys.
9. Create or join a coding channel.
10. Start the first coding session.

## Implementation Notes

- Keep onboarding state derived from real capabilities, not a single `onboardingCompleted` flag.
- Persist dismissals only for optional steps.
- Treat required steps as complete only when the underlying capability is actually available.
- Avoid duplicating types outside GraphQL codegen.
- Keep GraphQL resolvers thin; any new setup checks should live in services or desktop bridge APIs.
- For desktop-only checks, expose narrow IPC methods through `window.trace`.
- For server-side checks, use service-layer methods and event payloads that can hydrate Zustand directly.

## Suggested Milestones

### Milestone 1: Make blockers visible

- Replace self-serve no-org creation with invite-pending copy.
- Add desktop bridge readiness to the home checklist.
- Add local repo linked status to repository onboarding.
- Route first-session failures to setup actions.

### Milestone 2: Add GitHub capability setup

- Add GitHub app identity using OAuth/device flow.
- Reframe manual GitHub API tokens as a fallback path.
- Add GitHub CLI status check.
- Add terminal-based `gh auth login`.

### Milestone 3: Complete optional developer setup

- Surface repo hook setup after local path linking.
- Add missing API token provider rows.
- Add tests for all checklist state transitions and failure routing.

## Open Questions

- Should GitHub CLI auth be required only for local sessions, or also checked for cloud/container sessions?
- Should cloud runtime GitHub CLI auth use copied user tokens, device flow, or an injected credential strategy?
- Should first-run onboarding remain a home checklist, or become a focused setup screen for brand-new organizations?
- Should API keys be user-scoped, org-scoped, or both depending on provider and feature?
- When should self-serve organization creation become available, and should it be feature-flagged separately from invite-only onboarding?
