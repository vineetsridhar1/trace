# 35 — TestFlight Beta Launch

## Summary

Prepare and publish the first external TestFlight beta. Finalize store metadata, privacy labels, provisioning, and internal QA checklist. This is the "ship V1" ticket.

## What needs to happen

- **App Store Connect setup**:
  - App record created with bundle id `com.trace.mobile`, name, category, privacy policy URL, support URL.
  - Privacy labels declared accurately (data collected: name/email via auth; usage data via analytics; not linked to identity by default).
  - Age rating, content rights, export compliance filled.
- **TestFlight setup**:
  - Internal group: team members, automatic builds.
  - External group: 20–50 invitees for V1 beta. Review submission with "What to test" notes.
  - `Tester Notes` for each build summarizing what's new / what to look at.
- **Icons & launch screen**:
  - App icon asset (1024×1024 master + generated sizes via `expo-app-icon-utils` or similar).
  - iOS splash screen config (Expo SplashScreen).
- **Provisioning**:
  - EAS manages provisioning for prod profile; verify signing certificate, distribution.
- **Final QA checklist** (run on clean device):
  - Sign in, sign out, sign back in
  - Navigate all screens
  - Send a message; queue a message; drain queued
  - Answer a question; accept a plan
  - Stop a session
  - Archive a workspace
  - Background + foreground; subscription reconnects
  - Receive a push → tap → deep link lands correctly
  - Offline mode: banner shows; queued mutations retry (or fail gracefully)
  - Kill & relaunch: token persists
- **Release notes** in App Store Connect.
- **Announcement** to beta users.

## Dependencies

- All prior tickets complete.
- [33 — Crash Reporting](33-crash-reporting-and-analytics.md)
- [34 — CI + EAS](34-ci-and-eas-preview-builds.md)

## Completion requirements

- [ ] App record live in App Store Connect
- [ ] First production build accepted by TestFlight
- [ ] Internal group installed and using daily
- [ ] External group invited with clear testing instructions
- [ ] Crash-free session rate >99.5% over first 7 days
- [ ] Feedback channel open (email / internal Slack / in-app link)

## How to test

1. External tester receives invite, installs, opens app.
2. Completes sign-in and core session flow without guidance.
3. No blocking bugs in first 48h.
4. Sentry dashboard shows low crash rate.

## V1 success criteria (from plan §20)

- User can complete a full workday using mobile for session check-ins
- Every needed session interaction is available on mobile
- Internal users describe it as "feels like a real iOS app"
- No regressions in web from `client-core` extraction
- Crash-free sessions >99.5% over first month
