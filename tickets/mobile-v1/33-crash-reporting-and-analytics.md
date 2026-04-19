# 33 — Sentry Crash Reporting and Analytics Events

## Summary

Instrument the app with crash reporting (Sentry) and lightweight analytics for product events (not behavioral telemetry). Required before opening beta so we can spot regressions and understand usage.

## What needs to happen

- **Sentry**:
  - Install `@sentry/react-native`.
  - Configure in `app/_layout.tsx` before any other init: DSN via env, release tag from Expo constants, environment (`development` | `preview` | `production` based on EAS profile).
  - Attach user context after auth: `Sentry.setUser({ id, email })`. Clear on sign-out.
  - Breadcrumbs for key actions: screen navigations, mutations fired, auth transitions.
  - Native crash symbolication via EAS build's dSYM upload.
- **Analytics**:
  - Use the same event-producing pattern as web if one exists; otherwise, a minimal wrapper (`apps/mobile/src/lib/analytics.ts`) that posts events to a lightweight endpoint or `console.log`s in dev.
  - V1 events (fire-and-forget, no PII beyond user/org id):
    - `mobile_app_opened`
    - `mobile_sign_in_succeeded`
    - `mobile_org_switched`
    - `mobile_session_opened` ({ sessionId })
    - `mobile_message_sent` ({ mode, queued })
    - `mobile_session_stopped`
    - `mobile_plan_accepted`
    - `mobile_question_answered`
    - `mobile_push_registered`
    - `mobile_push_tapped` ({ deepLink })
  - Keep the payload simple — don't over-instrument. Decision log for future additions.
- **Opt-out**: respect `App Tracking Transparency` — no third-party cross-app tracking introduced. In-app analytics only.
- **Environment safety**:
  - Disable Sentry in development unless `DEV_SENTRY=true` in env (avoid noise).
  - Rate-limit analytics dispatch to prevent runaway during development.

## Dependencies

- All M1–M5 tickets complete.

## Completion requirements

- [ ] Sentry captures crashes with symbolicated stack traces
- [ ] User context attached post-auth
- [ ] All listed analytics events fire at correct points
- [ ] No user-identifying PII beyond user+org ids
- [ ] Dev mode doesn't pollute Sentry / analytics backends

## How to test

1. Force a crash in dev (`throw new Error('test')` in a screen) with Sentry env enabled → event appears in Sentry.
2. Step through the flow; verify each analytics event fires (inspect via `console.log` wrapper in dev).
3. Production build from TestFlight — crashes captured with correct release tag.
