# Security Fixes Checklist

Source: `SECURITY_AUDIT.md` (36 findings). Each item is checked off after the fix lands.

## Critical (ship-blockers)

- [x] **F1** Cross-org IDOR: `session(id)` query
- [x] **F2** Cross-org IDOR: `sessions(orgId)` query trusts caller-supplied orgId
- [x] **F3** Cross-org IDOR: `ticket(id)` query
- [x] **F4** Cross-org IDOR: `updateScopeAiMode` mutates by bare ID
- [x] **F5** `x-user-id` header accepted in production (identity spoof)
- [x] **F6** `JWT_SECRET` falls back to `"trace-dev-secret"`
- [x] **F7** OAuth `state` parameter → JWT exfiltration via postMessage
- [x] **F8** CORS `origin: true` + `credentials: true` when env unset
- [x] **F9** `/bridge` WebSocket accepts unauthenticated connections

## High

- [x] **F10** `ticketEvents` subscription has no auth
- [x] **F11** `sessionPortsChanged` / `sessionStatusChanged` have no auth
- [x] **F12** `sessionEvents` checks only org, not session access
- [x] **F13** `runSession` resolver drops ctx (`_ctx`)
- [x] **F14** Cloud session terminals attachable by any org member
- [x] **F15** Bridge `runtime_hello` spoof + unscoped session-routed messages
- [x] **F16** Cookie `secure`/`sameSite` pinned to `NODE_ENV==="production"` string
- [x] **F17** No server-side token revocation
- [x] **F18** `orgEvents` membership cache bypasses non-message channel events
- [x] **F19** Server binds to `0.0.0.0` unconditionally

## Medium

- [x] **F20** No GraphQL depth/complexity/introspection/rate limits
- [x] **F21** Agent context builder fetches without orgId filter
- [x] **F22** No destructive-action deny-list for non-`act` modes
- [x] **F23** Agent router doesn't re-verify triggering user's access
- [x] **F24** LLM call logs persist raw user messages + system prompt
- [x] **F25** Upload MIME allows SVG; no `Content-Disposition: attachment`
- [x] **F26** No key-version prefix on encrypted API tokens
- [x] **F27** Hardcoded super-admin email
- [x] **F28** (folded into F20)
- [x] **F29** Electron IPC handlers don't validate `repoId` / `localPath`
- [x] **F30** Electron BrowserWindow has no CSP
- [x] **F31** Hook runner entrypoint 0o755 without verifying parent perms
- [x] **F32** Terminal scrollback retention DoS / data retention

## Low

- [x] **F33** `DateTime` / `JSON` scalars lack validation
- [x] **F34** Upload key path check uses `includes("..")`, not normalization
- [x] **F35** Agent `observe` mode permits memory write + summary side effects
- [x] **F36** JWT echoed into HTML on OAuth callback (redundant with F7 fix)

## Follow-on hardening (post-audit)

- [x] Service-layer defense-in-depth: `sessionService.{get,run,terminate,dismiss,delete,sendMessage}` and `ticketService.{get,update,addComment,assign,unassign,link,unlink}` now accept an optional `organizationId` and filter via `findFirst({ where: { id, organizationId } })` so cross-org access is blocked even when a caller skips the resolver-level assertion.
- [x] Regression tests (`cross-org-idor.test.ts`) lock in F1/F3/F4/F13 at the service layer.
- [x] Rate limiting: per-IP limits on `/auth/*` (20/60s for start/callback/logout, 120/60s for `/auth/me`) and 600/60s on `/graphql`, backed by Redis with in-memory fallback.
- [x] Dependency CVE sweep: bumped `@apollo/server` → v5, `@anthropic-ai/sdk` → 0.81, `sanitize-html` → 2.17.3, `dompurify` → 3.4; added pnpm overrides for `path-to-regexp`, `picomatch`, `lodash-es`, `defu`, `brace-expansion`, `yaml`, `effect`. Remaining advisories are confined to `shadcn`/`vite` (dev build tools) and `quill` 2.0.3 (no upstream patch; web-side XSS sanitization already wraps quill output with DOMPurify).
- [x] SSRF audit: every outbound `fetch` targets a fixed host (GitHub OAuth, Fly Machines API) or an env-configured base URL (embedding provider). No user-supplied URL is ever fetched server-side.
- [x] Org-kick stream termination: `filterAsyncIterator` now accepts an `"end"` decision that drains the upstream and closes the subscription. `orgEvents` returns `"end"` when it sees a `member_left` event for the connected user, so a kicked user's WebSocket is torn down on the next event instead of silently filtered forever.
