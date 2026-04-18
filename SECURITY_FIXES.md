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

- [ ] **F20** No GraphQL depth/complexity/introspection/rate limits
- [ ] **F21** Agent context builder fetches without orgId filter
- [ ] **F22** No destructive-action deny-list for non-`act` modes
- [ ] **F23** Agent router doesn't re-verify triggering user's access
- [ ] **F24** LLM call logs persist raw user messages + system prompt
- [x] **F25** Upload MIME allows SVG; no `Content-Disposition: attachment`
- [ ] **F26** No key-version prefix on encrypted API tokens
- [x] **F27** Hardcoded super-admin email
- [ ] **F28** (folded into F20)
- [ ] **F29** Electron IPC handlers don't validate `repoId` / `localPath`
- [ ] **F30** Electron BrowserWindow has no CSP
- [ ] **F31** Hook runner entrypoint 0o755 without verifying parent perms
- [ ] **F32** Terminal scrollback retention DoS / data retention

## Low

- [ ] **F33** `DateTime` / `JSON` scalars lack validation
- [x] **F34** Upload key path check uses `includes("..")`, not normalization
- [ ] **F35** Agent `observe` mode permits memory write + summary side effects
- [x] **F36** JWT echoed into HTML on OAuth callback (redundant with F7 fix)
