# Launcher handoff: user GitHub PAT forwarding

Trace now forwards a user-supplied GitHub personal access token into provisioned
cloud sessions via `bootstrapEnv.GITHUB_TOKEN`. This document describes the
contract the launcher needs to honor, the trace-side change that delivers it,
and the cases the launcher must verify.

The companion launcher change on `trace-partridge/forward-user-github-token` in
`opendoor-labs/trace-deployment` already short-circuits `createGitHubTokenEnv`
when `request.bootstrapEnv.GITHUB_TOKEN` is present. This doc is the matching
spec from the trace side.

## What trace sends now

When a user starts (or resumes) a cloud session and has a `github` token saved
in their trace settings (`ApiToken` row, `provider = 'github'`), trace decrypts
it and adds it to the `bootstrapEnv` block of the `POST /start` request body:

```jsonc
{
  "sessionId": "session_...",
  "runtimeInstanceId": "runtime_...",
  "runtimeToken": "<jwt>",
  "bridgeUrl": "wss://.../bridge",
  "tool": "claude_code",
  "bootstrapEnv": {
    "TRACE_SESSION_ID": "session_...",
    "TRACE_ORG_ID": "org_...",
    "TRACE_RUNTIME_INSTANCE_ID": "runtime_...",
    "TRACE_RUNTIME_TOKEN": "<jwt>",
    "TRACE_BRIDGE_URL": "wss://.../bridge",
    "GITHUB_TOKEN": "ghp_..."           // only when the user has a PAT saved
  },
  // ...
}
```

`GITHUB_TOKEN` is **omitted entirely** (not set to empty/null) when the user has
no PAT on file. The launcher should not treat its absence as an error.

The value is the raw PAT exactly as the user entered it in trace settings. No
prefix, no `Bearer`, no JSON wrapping. Trace does not validate the format — if
the user pasted garbage, GitHub will reject it at request time.

## What changed in trace (for reference)

- `apps/server/src/lib/runtime-adapter-registry.ts`: added optional
  `userGithubToken?: string` to `RuntimeStartInput`.
- `apps/server/src/lib/session-router.ts`: looks up the PAT via
  `apiTokenService.getDecryptedTokens(actorId)` in both the initial start path
  (`createRuntime`) and the resume path (`transitionRuntime` resume case), and
  passes it down. Only runs for `adapterType === "provisioned"`.
- `apps/server/src/lib/runtime-adapters.ts`: `ProvisionedRuntimeAdapter.startSession`
  conditionally spreads `{ GITHUB_TOKEN: input.userGithubToken }` into
  `bootstrapEnv` when the field is present.
- Test coverage added in `apps/server/src/lib/runtime-adapters.test.ts`
  ("forwards a user GitHub PAT into bootstrapEnv as GITHUB_TOKEN" and the
  negative case).

No other request fields change. `actorId` / `metadata.requestedBy` continue to
identify the human who started the session, regardless of which token is
forwarded.

## What the launcher needs to do

This is what the launcher branch should already be doing. Re-stating the
expected behavior so we can verify the two sides agree:

1. **PAT path** (`bootstrapEnv.GITHUB_TOKEN` present):
   - Use the value as-is for git credentials inside the runner container.
   - Emit minimal git config rewrites — the standard `insteadOf` pattern works:
     ```
     git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
     git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "git@github.com:"
     ```
   - **Do not** mint a GitHub App installation token.
   - **Do not** wire up `TRACE_GITHUB_TOKEN_ENDPOINT` — PATs don't have an
     in-session refresh story (see "Known gap" below).
   - Authorship: commits and PRs created by the runner will be attributed to
     the user who owns the PAT, which is the whole point of this change.

2. **App-minted path** (`bootstrapEnv.GITHUB_TOKEN` absent):
   - Behavior is unchanged: mint a GitHub App installation token, wire up
     `TRACE_GITHUB_TOKEN_ENDPOINT` so the in-container helper can refresh it
     before expiry.
   - Authorship continues to surface as `opendoor-trace[bot]`.

## Test cases for the launcher

Suggested integration assertions on the launcher side:

| Case | `bootstrapEnv.GITHUB_TOKEN` | Expected behavior |
| --- | --- | --- |
| User has PAT saved | `"ghp_userToken"` | Runner env contains `GITHUB_TOKEN=ghp_userToken`; `git config --get-regexp 'url\..*\.insteadof'` lists the rewrites with that token; no install-token mint call; no `TRACE_GITHUB_TOKEN_ENDPOINT`. |
| User has no PAT | (field absent) | Existing App-minting path runs; refresh endpoint wired up. |
| Empty string defensive | `""` | Treat as absent (fall back to App-minting). Trace shouldn't send this, but the launcher should not paste an empty token into git config. |

The launcher already has a unit test for the present case in
`launcher/test/k8s.test.js` ("forwards user-supplied GitHub PAT from bootstrapEnv
without minting"). The empty-string case is worth adding even though trace
guards against it (`...(input.userGithubToken ? { GITHUB_TOKEN: ... } : {})`)
— defense in depth.

## Known gap: PAT expiry mid-session

If the user's PAT expires while a session is running, git operations inside the
container will fail. There is no PAT refresh mechanism — `TRACE_GITHUB_TOKEN_ENDPOINT`
is only wired up on the App-minted path.

For v1 this is acceptable. If we see it bite users, two improvements to
coordinate later:

- Trace surfaces a clearer error (currently the runner just gets a 401 from
  GitHub).
- Optional: launcher could probe `gh auth status` at startup and emit a
  structured failure that bubbles back through the lifecycle event stream.

## Rollout

- The trace change is gated behind data the user controls (they have to add a
  GitHub PAT in settings under `apps/web/src/components/settings/ApiTokensSection.tsx`).
  Users who haven't done that get the existing App-minting behavior.
- No environment flag toggles this; the contract is purely "field present →
  use PAT, field absent → mint." If a compliance scenario requires forcing
  the App-mint path org-wide, add an org-level toggle in trace and short-circuit
  the lookup — don't try to gate it from the launcher side, since the launcher
  has no concept of org policy.
- Transient PAT lookup failures on the trace side (DB blip, decryption error)
  degrade gracefully to the App-mint path: trace logs
  `user_github_token_lookup_failed` to telemetry and omits `GITHUB_TOKEN` from
  `bootstrapEnv`. The launcher should see the same behavior as a user with no
  PAT configured.
- Safe to deploy the trace side and the launcher side in either order:
  - Trace first + old launcher: launcher ignores the unknown `GITHUB_TOKEN`
    field and continues to mint, so authorship doesn't improve, but nothing
    breaks.
  - Launcher first + old trace: PAT field is never sent, launcher always takes
    the mint path. Same as today.
