# 09 - Pairing Login (Optional)

## Summary

Let users authenticate the CLI by pasting a pairing code generated from an authenticated web/desktop session: `trace login --pair <code>`. Requires a small, additive server generalization of the mobile pairing endpoints.

## Plan coverage

Owns plan lines:

- 100: pairing flow description
- 230: the optional server change (generalize device pairing)
- 307: open decision on whether pairing is worth it (this ticket is skippable; device flow + local login cover V1)

## What needs to happen

- Server (`apps/server/src/routes/auth.ts` + the mobile-auth service behind it):
  - Accept a non-mobile device kind on `/auth/mobile/pair` (or add a generic alias route, e.g. `/auth/device/pair`) so a `cli` client can exchange `{ pairingToken, installId, deviceName }` for a bearer token without a push `platform`.
  - Keep mobile behavior byte-identical; the change is additive. Paired-device listing/revocation (`/auth/mobile/devices`) should show CLI devices with their device kind.
- CLI:
  - `trace login --pair <code>`: generate and persist a stable `installId` in `config.json`, call the pair endpoint with `deviceName` (hostname), store the returned token.
  - Clear error messages for expired/invalid codes.

## Dependencies

- [03 - Auth Commands](03-auth-commands.md)

## Completion requirements

- [ ] A pairing code generated in web/desktop settings logs the CLI in
- [ ] Mobile pairing is unchanged (existing tests pass untouched)
- [ ] CLI devices appear in the paired-device list and can be revoked; a revoked CLI gets a 401 with the login hint
- [ ] Rate limiting on the pair endpoint applies to CLI attempts

## Implementation notes

- Look at `pairMobileDeviceForRequest` (~line 380) and `parsePushPlatform` before deciding between extending the platform enum vs a device-kind field — pick whichever keeps the mobile contract untouched.
- This ticket ships only if pairing proves nicer than the GitHub device flow in practice; do not block any other ticket on it.

## How to test

1. Generate a pairing code from the web client; `trace login --pair <code>`; `trace whoami` succeeds.
2. Revoke the device from web settings; the next CLI call 401s with the login hint.
3. Run the existing mobile pairing test suite unchanged.
