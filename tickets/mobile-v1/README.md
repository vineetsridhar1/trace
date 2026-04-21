# Mobile V1 — Ticket Index

Tickets for building the Trace Mobile V1 app: sessions-only, iOS-first, React Native + Expo. Work through milestones sequentially — tickets within a milestone can often overlap. See [`mobile-plan.md`](mobile-plan.md) for the full product requirements document.

## M0 — Foundations (client-core extraction)

Refactor `apps/web` to extract platform-free logic into `@trace/client-core`. Web continues to work throughout. No mobile code yet.

| # | Ticket | What it does |
|---|--------|-------------|
| 01 | [Client-Core Scaffolding](01-client-core-scaffolding.md) | New `packages/client-core` package with Platform interface and no-web-imports lint rule |
| 02 | [Extract Entity Store](02-extract-entity-store.md) | Move Zustand entity store into client-core; web imports from `@trace/client-core` |
| 03 | [Extract Auth Store](03-extract-auth-store.md) | Move auth store; storage goes through Platform abstraction; web wires its own Platform impl |
| 04 | [Extract Events, Mutations, GQL Client](04-extract-events-and-mutations.md) | Pure event handlers, mutations, optimistic helpers, and urql client factory into client-core |

## M1 — Mobile Shell + Auth

Boot the mobile app, wire it into the monorepo, and deliver end-to-end sign-in + hydration.

| # | Ticket | What it does |
|---|--------|-------------|
| 05 | [Mobile App Scaffold](05-mobile-app-scaffold.md) | `apps/mobile` with Expo + dev client + EAS Build + workspace wiring |
| 06 | [Mobile Platform Adapter](06-mobile-platform-adapter.md) | Platform impl using SecureStore (token) + MMKV (state) + native fetch/WS |
| 07 | [Server: Mobile OAuth Scheme](07-server-oauth-mobile-scheme.md) | Server supports `origin=trace-mobile` → redirect to custom scheme |
| 08 | [Server: Push Token Schema](08-server-push-token-registration.md) | Prisma `PushToken` + `registerPushToken`/`unregisterPushToken` mutations |
| 09 | [Sign-in, Hydration, Org Switcher](09-sign-in-flow-and-hydration.md) | GitHub OAuth flow, Keychain persistence, post-auth store hydration, org switcher sheet |

## M2 — Design System

Build the primitives. Every screen that comes later inherits polish by default.

| # | Ticket | What it does |
|---|--------|-------------|
| 10 | [Theme Tokens](10-theme-tokens.md) | Colors, typography, spacing, radius, motion, shadows, glass presets |
| 11 | [Core Primitives](11-core-primitives.md) | Screen, Text, Button, IconButton, Spinner |
| 12 | [Surface Primitives](12-surface-primitives-glass-sheet.md) | Card, Glass (Liquid Glass + fallback), Sheet |
| 13 | [Data Primitives](13-data-primitives.md) | ListRow, Chip, StatusDot, Avatar, Skeleton, SegmentedControl, EmptyState |
| 14 | [Haptics, Motion, Dev Route](14-haptics-motion-dev-route.md) | Haptic helper, motion helpers, in-app design-system dev screen |

## M3 — Navigation + Channels

| # | Ticket | What it does |
|---|--------|-------------|
| 15 | [Navigation Skeleton](15-navigation-tabs.md) | Expo Router route tree, **native UITabBar** via `react-native-bottom-tabs`, per-tab stack headers, bottom-accessory slot wired with a stub |
| 15a | [Active Sessions Accessory](15a-active-sessions-accessory.md) | Real `renderBottomAccessoryView` content: horizontal pager of in-progress sessions, shared `activeAccessoryIndex` state |
| 15b | [Session Player (Expanded Modal)](15b-session-player-expanded.md) | Tap-to-expand modal with three Reanimated detents, horizontal scrub, single-subscription invariant |
| 16 | [Channels List](16-channels-list-screen.md) | Coding-channels tab with search + All/Mine segmented filter |
| 17 | [Coding Channel → Session Groups](17-coding-channel-session-groups.md) | Session groups list with Active / Merged / Archived segments |
| 18 | [Settings + Org Switcher](18-settings-and-org-switcher.md) | Settings screen and org switcher sheet |

## M4 — Session Stream (the core)

The single most important feature surface. Built in composable pieces, all files <200 lines.

| # | Ticket | What it does |
|---|--------|-------------|
| 19 | [Session Group Detail](19-session-group-detail-and-tab-strip.md) | Group shell, header, tab strip, overflow menu |
| 20 | [Stream Shell + Virtualization](20-session-stream-shell-and-virtualization.md) | Session subscription, FlashList, pagination, auto-scroll, "New activity" pill |
| 21 | [Message Node Renderers](21-session-message-node-renderers.md) | User, assistant, tool calls, read-globs, commands, checkpoints, PR cards |
| 22 | [Pending-Input + Todo Bars](22-pending-input-and-active-todo-bars.md) | Question/plan pending bar; active todo strip |
| 23 | [Input Composer + Queued](23-session-input-and-queued-messages.md) | Send/queue composer, interaction-mode toggle, queued messages strip |
| 24 | [Actions + Connection](24-session-actions-and-connection-handling.md) | Stop, PR, copy link, connection-lost banner, retry, error surfacing |

## M5 — Home + Push

| # | Ticket | What it does |
|---|--------|-------------|
| 25 | [Home Screen](25-home-screen.md) | Three-section feed: needs you / working now / recently done |
| 26 | [Push Registration (Client)](26-push-notification-registration-client.md) | Request permissions, register token, handle foreground + tap |
| 27 | [Push Dispatch (Server)](27-server-push-dispatch.md) | Server-side dispatch via Expo Push API with debounce + receipt handling |
| 28 | [Deep Links + Universal Links](28-deep-linking-and-universal-links.md) | `trace://` scheme + `https://trace.app/m/...` universal links + AASA config |
| 29 | [App Badge Counts](29-app-badge-counts.md) | iOS badge reflects needs-input count; clears on resolution |

## M6 — Polish Pass

| # | Ticket | What it does |
|---|--------|-------------|
| 30 | [Motion + Haptics + Performance Polish](30-motion-and-haptic-polish-pass.md) | Real-device review of motion/haptics plus instrumentation against the mobile performance budgets |
| 31 | [Accessibility Audit](31-accessibility-audit.md) | VoiceOver, Dynamic Type, contrast, hit targets, Reduce Motion |
| 32 | [Empty + Error + Keyboard States](32-empty-error-keyboard-states.md) | Robust handling of zero-data, failures, offline, and keyboard-up |

## M7 — Beta

| # | Ticket | What it does |
|---|--------|-------------|
| 33 | [Crash Reporting + Analytics](33-crash-reporting-and-analytics.md) | Sentry + minimal product-event analytics |
| 34 | [CI + EAS Preview Builds](34-ci-and-eas-preview-builds.md) | CI runs typecheck/lint/test, file-size guardrail, EAS preview on PRs, smoke test |
| 35 | [TestFlight Beta Launch](35-testflight-beta-launch.md) | App Store Connect, TestFlight groups, QA checklist, ship V1 |

## Post-V1 Follow-ups

Explicitly scoped out of V1 per `mobile-plan.md` §21 (cloud-only, model pinned at creation). Scheduled after V1 ships.

| # | Ticket | What it does |
|---|--------|-------------|
| 36 | [Composer Model & Runtime Pickers](36-composer-model-and-runtime-pickers.md) | Make the model and hosting chips tappable; reuse `UPDATE_SESSION_CONFIG_MUTATION` + `AVAILABLE_RUNTIMES_QUERY` with the same gating web uses |

## Dependency graph

```
M0 — Foundations (web continues working throughout)
01 Client-Core Scaffolding
├─ 02 Entity Store
├─ 03 Auth Store
└─ 04 Events + Mutations + GQL Client  (needs 02, 03)

M1 — Mobile Shell + Auth (can run in parallel with M0 once 01 lands)
05 Mobile App Scaffold  (needs 01)
├─ 06 Platform Adapter  (needs 05, 03)
07 Server: OAuth Scheme
08 Server: Push Token Schema  (can land anytime; unblocks M5)
09 Sign-in + Hydration  (needs 06, 07, 04)

M2 — Design System (can run in parallel with M1 once 05 lands)
10 Theme Tokens  (needs 05)
├─ 11 Core Primitives  (needs 10)
│  ├─ 12 Surface Primitives  (needs 11)
│  └─ 13 Data Primitives  (needs 11)
└─ 14 Haptics + Motion + Dev Route  (needs 11, 12, 13)

M3 — Navigation + Channels  (needs M1 complete, M2 mostly complete)
15 Navigation Skeleton  (needs 09, 12, 13)
├─ 15a Active Sessions Accessory  (needs 15, 04)
│  └─ 15b Session Player Modal  (needs 15a, 12, 14)
├─ 16 Channels List  (needs 15, 13)
│  └─ 17 Session Groups List  (needs 16)
└─ 18 Settings + Org Switcher  (needs 15, 12, 13)

M4 — Session Stream  (needs M3 complete)
19 Group Detail + Tab Strip  (needs 17, 13, 12)
└─ 20 Stream Shell + Virtualization  (needs 19, 04)
   ├─ 21 Node Renderers  (needs 20)
   ├─ 22 Pending-Input + Todo Bars  (needs 20, 12)
   ├─ 23 Input Composer + Queued  (needs 20, 22)
   └─ 24 Actions + Connection  (needs 19, 21, 23)

M5 — Home + Push  (needs M4 complete)
25 Home Screen  (needs 09, 15, 13)
26 Push Registration  (needs 25, 08, 15)
27 Push Dispatch  (needs 08; lands server-side; tested with 26)
28 Deep Links  (needs 15, 09)
29 Badge Counts  (needs 25, 26)

M6 — Polish  (needs M5 complete)
30 Motion + Haptics + Performance
31 Accessibility
32 Empty/Error/Keyboard

M7 — Beta  (needs M6 complete)
33 Crash + Analytics
├─ 34 CI + EAS Preview
└─ 35 TestFlight Launch  (needs 33, 34)
```

## Parallelization notes

- Server tickets (07, 08, 27) can land on their own timeline and are not blocked by client tickets.
- M1 and M2 overlap heavily — once the mobile scaffold (05) exists, design-system work can run in parallel with auth work.
- Within M3, 15a and 16 can run in parallel after 15 lands. 15b requires 15a's shared `activeAccessoryIndex`.
- Within M4, tickets 21/22/23/24 can be worked in parallel after 20 lands.
- M6 tickets 30/31/32 are independent and can be tackled in any order / in parallel.

## Plan coverage map

- `§1 Executive summary`, `§2 Goals & non-goals`, and `§3 Primary use cases` are realized across tickets 01-35, with tickets 09-35 owning the user-facing mobile experience and the scope guardrails below enforcing the deliberate omissions.
- `§4 Tech stack`, `§5 Monorepo structure`, and `§7 Shared code strategy` are covered by tickets 01-06.
- `§6 Architecture`, `§12 State management rules`, and `§13 Event handling` are covered by tickets 02-04, 09, 20-24, 29, and 32.
- `§8 Authentication` is covered by tickets 06-09 and 18.
- `§9 Navigation structure` (incl. §9.2, §9.2.1) is covered by tickets 15, 15a, 15b, 18, 28, and 29.
- `§10 Screens` (incl. §10.8 Session Player) is covered by tickets 09, 15-25, 15a, and 15b.
- `§11 Design system` is covered by tickets 10-14, 30, and 31.
- `§14 Push notifications` is covered by tickets 08 and 26-29.
- `§15 Milestones` maps directly to the milestone grouping in this README (M0-M7).
- `§16 Performance requirements` is covered by tickets 20, 30, and 34.
- `§17 Quality, testing, and CI` is covered by tickets 01, 04, 31, and 34.
- `§18 Server-side prerequisites` is covered by tickets 07, 08, 27, and 28.
- `§19 Open questions & risks` are covered by tickets 12, 21, 23, 30, 34, and 35.
- `§20 Success criteria` and the ship-readiness work are covered by tickets 30-35.
- `§21 Out-of-scope reference` is enforced by the scope guardrails below and by the fact that no ticket takes on messaging, ticketing, terminals, file-tree/diff viewers, new-session creation, local-session control, light mode, or Android work for V1.

If the plan gains a new actionable requirement, add or update its owning ticket in the same change and keep this coverage map in sync.

## Scope guardrails

If you are unsure whether something belongs in V1, check §2 of [`mobile-plan.md`](mobile-plan.md) (Goals & Non-Goals) and §21 (Out-of-Scope Reference). When in doubt: ask before expanding scope. Messaging, tickets, terminal, file tree, session creation, and Android are all explicitly deferred.
