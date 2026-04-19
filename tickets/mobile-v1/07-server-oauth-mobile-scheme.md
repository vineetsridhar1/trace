# 07 — Server: GitHub OAuth Support for Mobile Custom Scheme

## Summary

The existing GitHub OAuth flow redirects to a web URL with a popup-based token handshake. Mobile uses `ASWebAuthenticationSession` which requires a custom URL scheme (`trace://auth/callback?token=...`) as the redirect target. The server needs to recognize an `origin=trace-mobile` query parameter and redirect to the custom scheme instead of the default web origin.

## What needs to happen

- In the server's GitHub OAuth handler (likely `apps/server/src/routes/auth.ts` or wherever `/auth/github` lives):
  - Accept `origin` query param on `/auth/github` — allowed values: current web origins + `trace-mobile`
  - Persist `origin` through the OAuth state parameter (signed, short-lived) so the callback can retrieve it
  - On callback (`/auth/github/callback`):
    - If `origin === 'trace-mobile'` → redirect `302` to `trace://auth/callback?token=${token}`
    - Else → existing web popup behavior (unchanged)
- Add `trace-mobile` to the server's allowed origin allowlist (if one exists).
- Ensure the token is short-lived-signed or one-time (same security posture as web).
- Document in server code comment why the custom scheme exists.

## Dependencies

None — can land in parallel with M0/M1 client work.

## Completion requirements

- [ ] `/auth/github?origin=trace-mobile` starts the flow
- [ ] `/auth/github/callback` redirects to `trace://auth/callback?token=...` for mobile origin
- [ ] Existing web OAuth continues to work unchanged (no regression)
- [ ] Token issued identically (same signing, same lifetime)
- [ ] Integration test covers the new origin branch

## How to test

1. In a browser, visit `http://localhost:4000/auth/github?origin=trace-mobile`, complete OAuth → final redirect should attempt `trace://auth/callback?token=...` (browser will error — that's expected; inspect response status/Location header).
2. In a browser, existing web flow (`origin=http://localhost:3000`) still works end-to-end.
3. Unit/integration test added for the mobile-origin branch.
