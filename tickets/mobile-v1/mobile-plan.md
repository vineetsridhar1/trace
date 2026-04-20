# Trace Mobile — V1 Product Requirements Document

**Status:** Draft
**Scope:** V1 — sessions-only mobile app
**Stack:** React Native + Expo (with dev client), TypeScript
**Target platforms:** iOS 17+ primary; Android is a non-goal for V1 but code must not preclude it.

---

## 1. Executive Summary

Trace Mobile is a native-feeling mobile client for the Trace platform, focused exclusively on **observing and driving AI coding sessions** while away from the desktop. It is not a messaging or project-management client in V1 — the experience is deliberately narrow so it can be polished deeply.

A user opens the app to see which of their sessions are working, needing input, or blocked. They can tap into any session, read what the agent is doing, send a follow-up prompt, queue a prompt for later, approve or answer a pending plan/question, and stop a runaway session. That's the job.

Everything that isn't required for that loop (messaging, tickets, org admin, repo management, project views, coding channel setup) is out of scope for V1.

The app is built on the same event-driven, service-layer-owned, event-sourced architecture as the web app. It shares code where code is platform-free — types, GraphQL operations, the Zustand entity store, event handlers — and diverges where the platform demands it — components, navigation, gestures, polish.

---

## 2. Goals & Non-Goals

### V1 Goals

1. **Session awareness at a glance.** A user opening the app sees every session that needs their attention, sorted by urgency.
2. **Session participation from anywhere.** A user can read session output, respond to questions, approve plans, send follow-up prompts, queue prompts while the agent is working, and stop sessions — all from mobile.
3. **Push-notify for the things that matter.** When a session asks a question, finishes, opens a PR, or errors, the user's phone notifies them. Tapping the notification deep-links into the session.
4. **Feel native.** Liquid Glass surfaces on iOS 26+, native sheets with detents, haptics on primary actions, correct keyboard behavior, 120fps scrolling, and no web-y "cross-platform" feel.
5. **Mirror web's architectural principles.** Event-driven state, service-layer-owned mutations, no reading mutation results to update UI, files under 200 lines, Zustand as the single source of truth, shadcn-equivalent primitives via a purpose-built mobile design system.

### Non-Goals for V1

- **Messaging.** Text channels, DMs, mentions in messages, channel message composition — all out. The inbox and chat surfaces do not exist.
- **Tickets.** No ticket list, detail, creation, or editing.
- **Project / repo management.** Read-only references where sessions live, but no creating/editing/configuring repos, projects, or channels.
- **Agent debug console.**
- **File tree / checkpoint diff browsing inside a session.** The mobile session view is message-stream-first; file exploration is deferred.
- **Terminal.** No interactive terminal for V1.
- **Local / bridge-hosted sessions.** V1 reads cloud-hosted sessions only. Local sessions are visible as read-only if present but cannot be started, resumed, or moved from mobile.
- **Session creation (from scratch).** A user cannot *create* a new session group from mobile in V1. They can resume/continue an existing group by sending a follow-up prompt. Starting a new workspace is deferred.
- **Org admin, billing, integrations.**
- **Android.** iOS-first. Android should be trivially achievable later by virtue of RN but isn't a V1 target.

### Explicitly deferred (clearly V2+ material)

- Starting new sessions
- Viewing checkpoints and branch diffs
- File tree exploration
- Terminal access
- Messaging/mentions
- Tickets
- Settings beyond sign-in/sign-out and active org

---

## 3. Primary Use Cases

1. **Check on a session while in line for coffee.** Open app → Home tab → see session "refactor auth middleware" is in `needs_input` → tap → read agent's question → tap "Yes, proceed" → background.
2. **Respond to a PR review request.** Push notification: "session opened PR" → tap → session detail opens to the PR event → open PR in Safari from a share action.
3. **Queue follow-ups during a commute.** Session is actively working → tap session → type "also add unit tests for the new middleware" → tap Send → message queues → drains when agent completes.
4. **Stop a runaway.** Session has been going for 20min on the wrong thing → tap session → long-press overflow → "Stop session" → confirm via sheet → session terminates.
5. **Scan the pipeline.** Home screen tab "All sessions" → filter by `active` → see live-updating list → thumb-scroll through sessions to verify expected work is happening.

---

## 4. Tech Stack & Key Dependencies

### Core

- **Runtime:** React Native 0.77+, New Architecture (Fabric + TurboModules) enabled
- **Framework:** Expo SDK 53+, with **dev client** (not Expo Go)
- **Language:** TypeScript strict mode
- **Build:** EAS Build (cloud builds, TestFlight, signing)

### Navigation

- **expo-router** (file-based, built on react-navigation)
- **react-native-screens** (real UINavigationController/stack)
- **react-native-bottom-tabs** + **@bottom-tabs/react-navigation** — native `UITabBarController` (real iOS tab bar). Paired with `expo-router`'s `withLayoutContext` so file-based routes drive a native navigator. iOS 26 Liquid Glass, tab-switch animations, native haptics, minimize-on-scroll, and `.tabViewBottomAccessory` all come from UIKit.

### State & Data

- **Zustand** — single state store (shared with web via `packages/client-core`)
- **urql** — GraphQL transport (cache disabled, Zustand owns state)
- **graphql-ws** — WebSocket subscriptions

### UI & Polish

- **react-native-reanimated** v3 — UI-thread animations
- **react-native-gesture-handler** — gestures
- **expo-haptics** — haptic feedback
- **expo-blur** — fallback blur for pre-iOS-26
- **expo-glass-effect** (or custom Expo module wrapping `UIGlassEffect`) — Liquid Glass on iOS 26+
- **@shopify/flash-list** — virtualized lists (all session/message lists)
- **@gorhom/bottom-sheet** OR `react-native-screens` native bottomSheet presentation (prefer native)
- **react-native-keyboard-controller** — keyboard avoidance that actually works
- **react-native-safe-area-context** — safe area insets
- **react-native-context-menu-view** — native long-press menus

### Storage & Auth

- **expo-secure-store** — auth token (Keychain on iOS)
- **react-native-mmkv** — Zustand persistence (100x faster than AsyncStorage)
- **expo-web-browser** — GitHub OAuth flow (opens ASWebAuthenticationSession)
- **expo-auth-session** — OAuth token exchange

### Notifications

- **expo-notifications** — push notification registration, handling, deep-linking

### Quality

- **TypeScript strict** — no `any` (per CLAUDE.md)
- **ESLint** shared config extended for RN rules
- **Prettier** — same config as `apps/web`

### Intentionally Excluded

- **NativeWind / Tailwind for RN.** The translation cost isn't worth it. A small typed theme + stylesheet helpers serve better.
- **react-query / Apollo / normalized urql cache.** Zustand remains the single source of truth. urql is transport-only.
- **Redux / MobX / Jotai.** Zustand only.
- **styled-components / emotion.** StyleSheet + theme helpers only.

---

## 5. Monorepo Structure

```
apps/
  mobile/                          — NEW: React Native + Expo app
    app/                           — expo-router file-based routes
      _layout.tsx                  — root layout, auth gate, providers
      (auth)/
        sign-in.tsx
      (authed)/
        _layout.tsx                — tabs layout
        index.tsx                  — Home (feed of sessions needing attention)
        channels/
          index.tsx                — coding channels list
          [id].tsx                 — session groups in a coding channel
        sessions/
          [groupId].tsx            — session group detail (tab strip)
          [groupId]/[sessionId].tsx— single session stream view
        settings.tsx               — minimal settings (user, org, sign out)
    src/
      components/
        design-system/             — primitives (Button, Sheet, ListRow, Text, ...)
        session/                   — session-specific composites
        channel/                   — coding channel views
        common/                    — shared cross-feature components
      hooks/                       — mobile-specific hooks
      lib/
        platform.ts                — Platform adapter for client-core
        notifications.ts           — expo-notifications registration + handlers
        haptics.ts                 — typed haptic wrappers
      native-modules/              — tiny Swift wrappers (glass-effect etc.)
      theme/                       — tokens (colors, typography, spacing, motion)
    app.json                       — Expo config
    eas.json                       — EAS Build profiles
    package.json
    tsconfig.json

packages/
  client-core/                     — NEW: platform-free client logic
    src/
      stores/
        entity.ts                  — moved from apps/web/src/stores/entity.ts
        auth.ts                    — generic auth store (platform-injected storage)
      events/
        handlers.ts                — org-events handler logic (pure functions)
        session-output.ts          — session_output subtype routing
      gql/
        client.ts                  — urql client factory (takes transport config)
        operations.ts              — re-exports from @trace/gql
      platform.ts                  — Platform interface (storage, secureStorage, transport)
    package.json
    tsconfig.json

  gql/                             — existing, unchanged
  shared/                          — existing
```

**Rule:** `packages/client-core` has **zero** imports from `react-dom`, `window`, `document`, `localStorage`. Enforced by ESLint rule `no-restricted-imports` + a CI check.

**Dependency coexistence:** Mobile and web share the monorepo, so their React type trees must stay unified. The root `package.json` pins `@types/react` via `pnpm.overrides` to match the React version RN ships with (currently `~19.1.0` for RN 0.81). Without the pin, mobile resolves `@types/react@19.1.x` while web resolves `19.2.x`, producing two incompatible React type trees and breaking `apps/web`'s `tsc` build. Bump this override in lockstep whenever the mobile RN version changes.

---

## 6. Architecture

Mobile mirrors web's architecture. The non-negotiables from `CLAUDE.md` all apply.

### 6.1 Event-Sourced State

**Events are the source of truth for state changes.** Mutations are fire-and-forget; the org-wide `orgEvents` subscription receives the resulting event and updates the Zustand store. This is identical to web.

- Mobile **never reads a mutation's return data to update UI state.**
- Every entity appears in the store exclusively as a result of an event upsert (from `orgEvents`, `sessionEvents`, or an initial query hydration).
- Events must carry enough data to upsert the full entity. If a payload is missing fields, the fix is on the server, not the client.

### 6.2 Service Layer Is the Product

The mobile app calls the same GraphQL API the web app calls. Zero new backend surface is required for V1 — every operation listed in this doc already exists (see §10). If a gap is discovered during implementation, add it to `schema.graphql` and the service layer first; do not create mobile-only endpoints.

### 6.3 Zustand as the Single Source of Truth

- All shared state lives in Zustand (`packages/client-core/stores/entity.ts`).
- `useState` is allowed only for pure-local UI state (a toggle, a scroll position within one screen) that no other component or screen could possibly need.
- urql's cache is disabled; queries return data that is immediately normalized via `upsertMany` into the entity store.
- Components take **IDs as props**, never full entity objects. They read fields via `useEntityField(type, id, field)` and scoped events via `useScopedEventField(scopeKey, id, field)`.

### 6.4 Viewport-Driven Subscriptions

Mobile follows the same subscription tiering as web:

- **Ambient (always-on):** `orgEvents` subscription for the currently-active org. This drives badges, push decisions, and list ordering.
- **Focused:** `sessionEvents` subscription for the single session currently on screen. Subscribes when the screen mounts, unsubscribes on blur/unmount. This is where full session_output payloads come from.
- **Focused:** `sessionStatusChanged` subscribed only on the active session screen. V1 has no session-ports UI, so `sessionPortsChanged` is not part of the mobile surface.

### 6.5 Files Under 200 Lines

Every `.ts`/`.tsx` file in `apps/mobile/src/` stays under 200 lines. Same rule as web. Split by composition, extract hooks, extract subcomponents.

### 6.6 Adapters, Not Hardcoded Integrations

The same pluggable-adapter principle applies. The mobile app only knows about the service layer — it does not know which SessionAdapter, CodingToolAdapter, or LLMAdapter is in use. It displays whatever the server tells it.

---

## 7. Shared Code Strategy: `packages/client-core`

### 7.1 What moves to `client-core`

Extracted from `apps/web/src/` in a preparatory refactor **before** mobile development begins:

- `stores/entity.ts` → entire entity store, selectors, scoped-event utilities
- `stores/auth.ts` → refactored to accept a `Platform` adapter for storage
- `hooks/useOrgEvents.ts` → split: the event-to-store logic (`handleOrgEvent`) moves to `client-core/events/handlers.ts`; the `useSubscription` hook wrapper stays in each app
- `hooks/useSessionEvents.ts` → same split (`handleSessionEvent`)
- `lib/optimistic-message.ts` → all of it
- `lib/mutations.ts` → all of it (mutations are platform-free)
- `lib/urql.ts` → only the **factory** (`createGqlClient({ httpUrl, wsUrl, onConnectionChange })`); each app constructs its own client and passes it to the urql `Provider`
- GraphQL operation definitions (queries/subs) → all of them, re-exported from `@trace/gql` if not already
- Utility helpers: scope key builders, sort timestamp logic, etc.
- `notifications/registry.ts` — `registerHandler` / `notifyForEvent`; per-platform notification delivery (sonner / expo-notifications) stays in the apps
- `events/ui-bindings.ts` — `OrgEventUIBindings` registry the handlers call into for UI side effects (badge marking, active-session/channel/group navigation, session-tab opening). Each platform installs an impl via `setOrgEventUIBindings()` at boot. Mobile uses no-op or platform-appropriate impls for web-only concerns (e.g. `openSessionTab`).

### 7.2 What stays platform-specific

- Anything that touches the DOM, `window`, `localStorage`, `document`
- urql client **instantiation** (transport config differs: web uses `graphql-ws` over `ws://`; mobile uses the same but with different fetch/websocket polyfills)
- Notification dispatch (web: sonner + Notification API; mobile: expo-notifications)
- Navigation (react-router on web, expo-router on mobile)
- Every component

### 7.3 Platform interface

```ts
// packages/client-core/src/platform.ts
export interface Platform {
  apiUrl: string;
  storage: {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
  };
  secureStorage: {
    getToken(): Promise<string | null>;
    setToken(token: string): Promise<void>;
    clearToken(): Promise<void>;
  };
  fetch: typeof fetch;
  createWebSocket: (url: string, protocols?: string[]) => WebSocket;
}
```

Each app instantiates `client-core` with its platform impl at boot. Web uses `apps/web/src/lib/platform-web.ts` (passes `import.meta.env.VITE_API_URL`); mobile uses `apps/mobile/src/lib/platform-mobile.ts` (passes `process.env.EXPO_PUBLIC_API_URL`) that wraps `expo-secure-store`, `MMKV`, and the RN fetch/WebSocket globals. `apiUrl` lives on the platform because `@trace/client-core` builds absolute URLs for `/auth/me`, `/auth/logout`, and uploads — neither side has a sane default.

### 7.4 Extraction timing

Per §15 (Milestones): `client-core` is extracted in milestone M0 **before** any mobile screen work. This is a one-time, well-scoped refactor of web that changes imports but not behavior. Web is continuously kept working.

---

## 8. Authentication

### 8.1 Sign-in flow

- Mobile supports **GitHub OAuth only** in V1 (same as web).
- Tap "Sign in with GitHub" → opens `ASWebAuthenticationSession` via `expo-auth-session`, targeting `${API_URL}/auth/github?origin=trace-mobile`.
- Server must add support for `trace-mobile` origin (redirect to a custom scheme: `trace://auth/callback?token=...`). **Server change required** — tracked as a V1 prerequisite (see §18).
- On callback, mobile extracts the token and stores it via `expo-secure-store` (Keychain on iOS).
- `fetchMe()` loads user + org memberships, same as web.
- Active org: stored in MMKV (`trace_active_org`). If unset, defaults to first membership.

### 8.2 Session persistence

- Token persists in Keychain; app resumes authenticated across launches.
- On app foreground after >24h, re-fetch `/auth/me` to refresh session and detect revocation.
- On 401 from any GraphQL call: clear Keychain, navigate to sign-in.

### 8.3 Org switcher

- Accessible from Settings screen.
- A simple list of memberships; tap to switch.
- Switching clears focused subscriptions, tears down and rebuilds the urql client with the new `X-Organization-Id` header, and reloads the entity store.

---

## 9. Navigation Structure

### 9.1 Route tree (expo-router)

```
/                                  — redirects based on auth
/(auth)/sign-in                    — not signed in lands here
/(authed)/                         — tabs root
  /                                — Tab: Home
  /channels                        — Tab: Channels
  /channels/[id]                   — Coding channel detail (session groups list)
  /sessions/[groupId]              — Session group detail (tabs over sessions)
  /sessions/[groupId]/[sessionId]  — Single session stream (primary screen)
  /settings                        — Tab: Settings
```

### 9.2 Tab bar

Three tabs, persistent at the bottom, rendered by the **native `UITabBarController`** via `react-native-bottom-tabs` + `@bottom-tabs/react-navigation`. We do not hand-roll a tab bar in JS. iOS 26 Liquid Glass, tab-switch animations, haptics, and minimize-on-scroll come from UIKit.

1. **Home** — SF Symbol `bolt.horizontal`. A single feed of sessions needing the user's attention (needs_input + recently-updated active). Default tab.
2. **Channels** — SF Symbol `tray`. Coding channels list; drill down into a channel shows its session groups table.
3. **Settings** — SF Symbol `gearshape`. User, org switcher, sign out.

Badges:
- Home tab: count of sessions in `needs_input` belonging to current user (wired via `tabBarBadge: String(count)`)
- Channels tab: none in V1

Non-tab routes (e.g. `sessions/[groupId]`, `sheets/*`) are declared with `tabBarItemHidden: true` so they're routable via push without showing in the bar.

Per-tab iOS `largeTitle` headers live inside pathless route groups (`(home)`, `(settings)`) so each tab has its own Stack without changing URL paths.

### 9.2.1 Bottom accessory slot

The iOS 26 `.tabViewBottomAccessory` slot (exposed by `react-native-bottom-tabs` as `renderBottomAccessoryView`) carries an "active sessions" mini-strip: a horizontal pager over the user's currently-in-progress sessions that taps to expand into the full Session Player (§10.8). The accessory returns `null` when no sessions are active, collapsing UITabBar back to normal height. `minimizeBehavior="onScrollDown"` collapses the tab bar + accessory together as the active screen scrolls.

The accessory and the expanded player read from a single shared `activeAccessoryIndex` in `useMobileUIStore` so swiping in one updates the other.

### 9.3 Modal/sheet usage

Native iOS sheets (via `react-native-screens` `formSheet`/`pageSheet` presentations) for:
- Org switcher (sheet with medium detent)
- Session action menu (stop, archive, open PR) — presented as an action sheet
- Sign-out confirmation (alert-style sheet)

Full-screen modals for:
- None in V1.

### 9.4 Deep linking

- Scheme: `trace://`
- Universal links: `https://trace.app/m/...` (configured via Apple App Site Association)
- Supported paths:
  - `trace://sessions/:groupId/:sessionId` — opens session stream
  - `trace://channels/:id` — opens coding channel
  - `trace://auth/callback?token=...` — OAuth callback (internal only)
- Push notifications carry a `data.deepLink` field; tapping routes through the deep-link handler.

---

## 10. Screens

### 10.1 Sign-in Screen — `app/(auth)/sign-in.tsx`

**Purpose:** Unauthenticated entry point.

**Data:** none.

**UI:**
- Trace wordmark, tagline.
- Single primary button: "Continue with GitHub".
- Tiny footer: Terms, Privacy (web links).

**Actions:**
- Tap button → `WebBrowser.openAuthSessionAsync(...)` → completes auth flow → receives token → stores in Keychain → navigates to `/(authed)/`.

**States:**
- Idle
- Authenticating (spinner on button, button disabled)
- Error (inline error below button: "Sign-in failed. Try again.")

**Polish:**
- Haptic `light` on button press; `success` on successful auth.
- Subtle animated gradient behind wordmark (Reanimated, UI thread, 60fps max).

---

### 10.2 Home Screen — `app/(authed)/index.tsx`

**Purpose:** Single scroll showing every session that needs the user's attention *right now*, sorted by urgency.

**Sections (in order):**
1. **Needs you** — sessions with `sessionStatus === "needs_input"` belonging to the current user. Most urgent: `question_pending` first, `plan_pending` second.
2. **Working now** — sessions with `agentStatus === "active"` belonging to the current user, sorted by `_sortTimestamp` descending.
3. **Recently done** — sessions with `agentStatus === "done"` or `sessionStatus === "in_review"` from the last 24h, belonging to the current user.

**Data:**
- Query `mySessions(organizationId)` on mount — hydrates store.
- Reads live from `useEntityStore` with a selector that filters and sorts by section.
- Subscribes to `orgEvents` (ambient) — list live-updates.

**Actions:**
- Tap a session row → navigate to `/sessions/[groupId]/[sessionId]`.
- Pull to refresh → re-hydrate via `mySessions`.
- Long-press a row → context menu: "Open PR" (if `prUrl`), "Stop session" (if active), "Copy link".

**Empty state:**
- If all three sections empty: Trace icon + "All clear" + "Sessions that need you will show up here."

**Polish:**
- Section headers pinned (sticky) while scrolling.
- Section-insertion and row-reordering uses Reanimated layout animations.
- Row on press: subtle scale + haptic `light`.
- `FlashList` for virtualization.

---

### 10.3 Channels Screen — `app/(authed)/channels/index.tsx`

**Purpose:** List all coding channels the user has access to. V1 shows coding channels only; text channels are hidden.

**Data:**
- Existing query: the channels list is included in the org hydration (see §14).
- Filter client-side to `type === "coding"`.
- Live via `orgEvents` (`channel_created`, `channel_updated`, `channel_deleted`).

**UI:**
- Grouped list by `channelGroup` if groups exist; flat otherwise.
- Each row: channel name, tiny subtitle ("N active sessions"), chevron.

**Actions:**
- Tap → `/channels/[id]`.

**Polish:**
- Segmented control at top if the org has a large number of channels: "All", "Mine" (where user has recent sessions).
- Native iOS pull-to-reveal search bar (Mail / Settings pattern): hidden at rest, revealed when the large-title header is pulled down. Use `headerSearchBarOptions` with the default `hideWhenScrolling: true`.

---

### 10.4 Coding Channel Screen — `app/(authed)/channels/[id].tsx`

**Purpose:** List session groups within a coding channel.

**Data:**
- Query `sessionGroups(channelId, archived: false)` on mount.
- Live via `orgEvents`.
- Derived: active count, needs-input count for header subtitle.

**UI:**
- Header: channel name, subtitle ("3 active · 1 needs input"), segmented control: "Active" / "Merged" / "Archived".
- List of session group rows. Each row:
  - Name (bold)
  - Status chip (color-coded): in_progress, needs_input, in_review, merged, failed
  - Branch name (monospace, subtle)
  - Preview of last event (one line, dim)
  - Timestamp
- `FlashList` virtualization.

**Actions:**
- Tap → `/sessions/[groupId]`.
- Long-press → context menu: "Archive workspace", "Copy link".
- No create-session button in V1.

**Empty state:**
- "No active sessions in this channel yet."

**Polish:**
- Status chips have subtle pulse animation when `in_progress`.
- Liquid Glass header on iOS 26+.

---

### 10.5 Session Group Detail — `app/(authed)/sessions/[groupId].tsx`

**Purpose:** Entry screen for a session group. In V1, this screen is **thin** — it immediately routes to the most-recent session within the group. If the group has multiple sessions, a tab strip appears at the top to switch.

**Data:**
- Query `sessionGroup(id)` — full group + sibling sessions + checkpoints.
- Live via `sessionEvents` (full payloads) once mounted.

**UI:**
- Header:
  - Group name + branch (monospace)
  - PR status chip (if `prUrl`): "PR open", "PR merged", "PR closed"
  - Overflow menu (`...`) — native context menu
- Tab strip (only if >1 session): pills for each sibling session. Active session is rendered below.
- Session stream (see §10.6) fills remainder.

**Actions:**
- Tab tap → switch active session (updates URL to `/sessions/[groupId]/[sessionId]`).
- Overflow: "Open PR" (if prUrl), "Archive workspace", "Copy link".

**Polish:**
- Tab strip uses Reanimated underline indicator.
- Header collapses on scroll (native iOS large-title behavior, implemented via `react-native-screens` `largeTitle` mode).

---

### 10.6 Session Stream Screen — `app/(authed)/sessions/[groupId]/[sessionId].tsx`

**This is the single most important screen in V1.** It is where the user spends most of their time.

**Purpose:** View the message/event stream for a specific session and interact with it.

**Data:**
- Query `session(id)` on mount (includes queuedMessages, gitCheckpoints).
- Subscribe to `sessionEvents(sessionId, organizationId)` — full payloads.
- Subscribe to `sessionStatusChanged(sessionId, organizationId)`.
- Pagination: fetch older events on scroll-to-top.

**UI structure (top-to-bottom):**
1. **Header** — session name, agent status dot (active/done/failed/stopped), overflow menu.
2. **Pending-input bar** (conditional, pinned below header) — appears when `sessionStatus === "needs_input"`:
   - If `question_pending`: renders the question + answer buttons inline.
   - If `plan_pending`: renders a compact plan card with "Accept" and "Send feedback" actions.
3. **Active todo strip** (conditional) — if the agent is active and has a current todo list, a single-line sticky strip shows the current todo ("✓ 3 of 7 · Refactoring auth middleware").
4. **Message stream** — virtualized scroll list (`FlashList`) of nodes derived from events. Node renderers:
   - `UserMessageBubble` — right-aligned, user avatar
   - `AssistantMessage` — markdown-rendered with rich blocks
   - `ToolCallRow` — collapsed by default, tap to expand
   - `ToolResultRow` — success/error indicator
   - `ReadGlobGroup` — "Read 12 files" (tap to see list; V1 does NOT open file contents)
   - `CommandExecutionRow` — command + exit code
   - `CheckpointMarker` — inline chip: "✓ Committed: add login form (3 files)"
   - `PRCard` — inline card when PR is opened/merged/closed
   - `ConnectionLostBanner` — dim banner in-stream with retry action
5. **Queued messages strip** (conditional, above input) — horizontal scrolling chips with `×` to remove; "Clear all" if >1.
6. **Input composer** — pinned to bottom, keyboard-aware:
   - Plain text input (V1 — no rich editor, no image attachments, no slash commands; defer to V2)
   - Interaction mode toggle (3-state: code / plan / ask) — small pill left of send
   - Send button (disabled when empty)
   - When `agentStatus === "active"`: button label changes to "Queue" and queues via `queueSessionMessage`; otherwise sends via `sendSessionMessage`.

**Actions:**
- Send message: `sendSessionMessage` mutation with optimistic event insert (per §14.3).
- Queue message: `queueSessionMessage` mutation (optimistic insert to `queuedMessages`).
- Remove queued: `removeQueuedMessage`.
- Clear queued: `clearQueuedMessages`.
- Accept plan: `sendSessionMessage` with the configured plan-accept text (same as web).
- Answer question: inline buttons call `sendSessionMessage` with answer.
- Stop session: overflow menu → "Stop session" → confirm sheet → `dismissSession` mutation.
- Retry connection: inline retry action in connection-lost banner → `retrySessionConnection`.

**States:**
- Loading (skeleton stream)
- Empty (new session, no events yet) — "Waiting for agent to start..."
- Loaded (normal)
- Connection lost (banner in stream, input disabled)
- Session done (composer disabled, subtle "Session complete" hint)
- Errored (inline error card with last-error text; retry action if `canRetry`)

**Polish:**
- Auto-scroll to bottom when new events arrive *and* user is already near the bottom. If user has scrolled up, do not yank them — instead show a "New activity" pill floating above the input that taps to jump down.
- Haptic `light` on send/queue; `medium` on stop confirmation.
- Assistant message "typing" effect when the most recent event is streaming: subtle cursor block at end of text.
- Keyboard-avoiding via `react-native-keyboard-controller` — the input rises smoothly, stream adjusts, no jank.
- Liquid Glass on the input container and any pinned bars (pending-input, queued strip) on iOS 26+.
- Long-press on a message bubble → native context menu: "Copy".

**File size note:** This screen is the largest in the app. It WILL exceed 200 lines if not split. Mandatory split:
- `SessionStreamScreen.tsx` — top-level screen composition (~100 lines)
- `SessionHeader.tsx`
- `PendingInputBar.tsx`
- `ActiveTodoStrip.tsx`
- `MessageStream.tsx` — the FlashList
- `QueuedMessagesStrip.tsx`
- `SessionInputComposer.tsx`
- One file per node renderer in `components/session/nodes/`

---

### 10.7 Settings Screen — `app/(authed)/settings.tsx`

**Purpose:** Minimal settings: user, org switcher, sign out.

**UI:**
- User row: avatar + name + email (tap does nothing in V1)
- Active org row → opens org-switcher sheet
- Sign out row → confirmation sheet → `auth.signOut()`
- App version + build footer

**Out of scope:** theme, notifications config, profile edit.

---

### 10.8 Session Player — `app/(authed)/sheets/session-player.tsx`

**Purpose:** Expand the Active Sessions bottom-accessory (§9.2.1) into a full-screen, gesture-driven player that previews currently-in-progress sessions without leaving whatever tab the user was on.

**UI structure:**
1. **Player card** — session name, agent status, small stop action (if `active`). No composer — full send/queue flow stays on the session stream screen (§10.6).
2. **In-progress list** (revealed at the `"playerAndList"` detent) — one row per active session; tap snaps the player to that session.

**Gesture model (Reanimated, UI thread):**
- Detents: `"player"` → `"playerAndList"` → `"dismissed"`.
- Pull-down from player advances the detent; second pull-down dismisses.
- Horizontal swipe inside the player updates `activeAccessoryIndex` (shared with the accessory).

**Single-subscription invariant:** only the session pointed to by `activeAccessoryIndex` has an active `sessionEvents` subscription; switching sessions tears down the previous subscription before starting the new one.

**V1 scope guardrails:** no composer, no recently-done sessions in the list, no branching/ticketing surfaces.

---

## 11. Design System

### 11.1 Design principles

- **iOS-first, iOS-native.** Use iOS conventions: large titles, pull-to-refresh, swipe-to-go-back, bottom tabs, action sheets, native context menus. Don't reinvent.
- **Liquid Glass where it counts.** Tab bar, navigation bar, input container, pending-input bar, queued messages strip. Don't use it everywhere — it loses meaning.
- **Depth, not chrome.** Use blur/glass and subtle shadows for hierarchy, not borders and dividers.
- **Motion is functional.** Every animation communicates state (list reorder, new item arrival, status change). No decorative motion.
- **Haptics on every primary action.** Send, queue, stop, sign in, approve plan, answer question, switch tab.

### 11.2 Theme tokens

Defined in `src/theme/`:

```
theme/
  colors.ts     — semantic tokens: background, surface, surfaceElevated,
                  foreground, mutedForeground, accent, destructive,
                  success, warning, glassTint
  typography.ts — font families, sizes, weights, line heights (iOS system font)
  spacing.ts    — 4pt scale: 1=4, 2=8, 3=12, 4=16, 6=24, 8=32
  radius.ts     — sm=6, md=10, lg=14, xl=20, full=9999
  motion.ts     — durations, easings, spring configs
  shadows.ts    — iOS-style subtle shadows for elevated surfaces
  glass.ts      — Liquid Glass presets: tint, intensity, shape
```

Color tokens map 1:1 to the web app's semantic tokens wherever possible (`bg-surface-deep`, `text-muted-foreground`, etc.) so branding is consistent.

### 11.3 Primitives (`components/design-system/`)

Built once, used everywhere. Each is one file, <200 lines.

- `Screen.tsx` — root screen wrapper (safe area, status bar, background)
- `Text.tsx` — typography wrapper, variant prop (`title` | `headline` | `body` | `caption` | `mono`)
- `Button.tsx` — variants (primary, secondary, ghost, destructive), sizes, haptic on press
- `IconButton.tsx` — SF Symbols icon; native iOS context menu support built in
- `ListRow.tsx` — standard tap row with title/subtitle/trailing slot
- `Sheet.tsx` — wraps native iOS sheet presentation with detents
- `Card.tsx` — elevated surface with optional Liquid Glass
- `Glass.tsx` — Liquid Glass container (iOS 26+) with `expo-blur` fallback
- `Chip.tsx` — status chip with variants (active, needs-input, done, failed, merged)
- `Avatar.tsx` — user avatar with fallback initials
- `Skeleton.tsx` — shimmer placeholder
- `EmptyState.tsx` — icon + title + subtitle + optional action
- `SegmentedControl.tsx` — iOS segmented control wrapper
- `Spinner.tsx` — native UIActivityIndicator
- `StatusDot.tsx` — animated status indicator (pulse when active)

### 11.4 Motion guidelines

- **List insertions/reorders:** Reanimated `LayoutAnimation` with `FadeIn` / `Layout` spring (`damping: 20, stiffness: 250`).
- **Tap feedback:** Scale `0.98` on press with spring-back; 100ms total.
- **Screen transitions:** default `react-native-screens` native push/pop; no custom.
- **Sheet:** native iOS sheet physics — don't reimplement.
- **Typing cursor (streaming assistant message):** opacity blink, 800ms period.
- **Status-change flash:** row background briefly flashes `accent` tint on status transition, fades over 400ms.

### 11.5 Liquid Glass usage

System-provided (we don't wrap these in our `Glass` primitive — UIKit does it):
- **Tab bar** — native `UITabBarController` via `react-native-bottom-tabs` (§9.2)
- **Bottom accessory slot** — content passed to `renderBottomAccessoryView` is composited inside the tab bar's glass material (§9.2.1)
- **Native-stack `headerRight`** — iOS 26 wraps trailing bar-button content in a glass pill automatically (used by `TopBarPill`)

Where to use our `Glass` primitive:
- Navigation bar when content scrolls beneath (custom pinned bars above the stack header)
- Input composer container
- Pinned pending-input bar
- Queued-messages strip
- Session Player card and list surfaces (§10.8)
- Session header when `largeTitle` collapses

Where NOT to use:
- List row backgrounds
- Message bubbles
- Buttons
- Empty states
- The bottom tab bar (UITabBar material only — do not nest a `Glass` wrapper inside `renderBottomAccessoryView`)
- Native header right slots (iOS 26 double-wraps)

On iOS <26 / Android: our `Glass` falls back to `expo-blur` with `tint="systemThinMaterialDark"` (or light variant based on theme). The native UITabBar gracefully falls back to its pre-iOS-26 tab bar appearance.

Theme note: `glass.ts` no longer ships a `tabBar` preset (removed in ticket 15) — the surviving presets are `navBar`, `input`, `pinnedBar`, and `card`. A `sessionPlayer` preset will be added in ticket 15b.

### 11.6 Haptic map

| Action                              | Haptic           |
|-------------------------------------|------------------|
| Tab switch                          | `selection`      |
| List row tap                        | `light`          |
| Primary button tap                  | `medium`         |
| Destructive confirmation            | `heavy`          |
| Send/queue message                  | `light`          |
| Stop session (confirm)              | `heavy`          |
| Approve plan                        | `success`        |
| Answer question                     | `light`          |
| Successful OAuth                    | `success`        |
| Error (network, mutation fail)      | `error`          |
| Pull-to-refresh trigger             | `medium`         |

---

## 12. State Management Rules (Mobile-specific clarifications)

These are on top of the principles already stated in §6.

### 12.1 Hydration sequence

On app launch (post-auth):
1. `me` query → user + org memberships (via REST `/auth/me`, handled in the auth store)
2. In parallel: `organization(id)` → org + channels, `channelGroups(organizationId)` → channel groups, `mySessions(organizationId)` → all user's sessions (any status). `channelGroups` is its own root query because the GraphQL `Organization` type does not expose a `channelGroups` field.
3. Subscribe to `orgEvents(organizationId)` (ambient)
4. App is interactive.

On screen focus:
- Coding channel: query `sessionGroups(channelId)` for the currently-visible tab (active | merged | archived)
- Session detail: query `session(id)` + subscribe to `sessionEvents(sessionId, organizationId)` and `sessionStatusChanged(sessionId, organizationId)`

On screen blur:
- Unsubscribe focused subscriptions. `orgEvents` stays subscribed.

### 12.2 Optimistic message events

Mirror web's `lib/optimistic-message.ts`:
- On `sendSessionMessage`, insert an optimistic event into the session's scoped event store immediately with a temporary id.
- When the real event arrives via subscription, reconcile (replace/remove the optimistic entry).
- On mutation error, remove the optimistic entry and surface an error toast.

### 12.3 Queued messages

Mirror web's behavior exactly:
- `queued_message_added` event → upsert into `queuedMessages` table, index by session
- `queued_message_removed` → remove
- `queued_messages_cleared` → clear session's queue
- `queued_messages_drained` → remove (message was sent, becomes a regular event)

### 12.4 Sort timestamps

Mobile uses the same `_sortTimestamp` logic as web for session ordering. No new semantics.

### 12.5 No mutation result reads

A mutation's return payload is **ignored** for state purposes. It may be used only for:
- Confirming HTTP-level success
- Passing a server-assigned id back to an optimistic entry's reconciliation logic (via clientMutationId)

If a code path wants to "use the mutation result to show the new thing," the correct fix is to ensure the event-driven path handles it — not to bypass it.

---

## 13. Event Handling

Mobile subscribes to exactly the same events as web and handles them with the same logic — the logic itself lives in `packages/client-core/events/handlers.ts` and is called from both apps.

### 13.1 Events handled for V1

From `EventType` enum in `schema.graphql`:

**Session lifecycle (all handled):**
- `session_started`, `session_paused`, `session_resumed`, `session_terminated`, `session_deleted`

**Session output (handled, same subtype routing as web):**
- `assistant` → append to stream
- `question_pending` → set `sessionStatus = "needs_input"`; populate pending question
- `plan_pending` → set `sessionStatus = "needs_input"`; populate pending plan
- `workspace_ready` → update `session.workdir`
- `title_generated` → update `session.name`
- `branch_renamed` → update branch on session + siblings
- `git_checkpoint`, `git_checkpoint_rewrite` → upsert into `gitCheckpoints`
- `connection_lost`, `connection_restored`, `recovery_failed` → update `session.connection`

**PR events:**
- `session_pr_opened`, `session_pr_merged`, `session_pr_closed` → update `session.prUrl`, bump _sortTimestamp, trigger notification

**Session group:**
- `session_group_archived` → update status

**Queued messages:**
- `queued_message_added`, `queued_message_removed`, `queued_messages_cleared`, `queued_messages_drained` — all handled

**Ignored in V1 (not rendered, still consumed so store stays consistent):**
- All `message_sent` events (messaging is out of scope for rendering but must still update counters for notifications if the event mentions the user — see §14)
- `inbox_item_created`, `inbox_item_resolved`
- `ticket_*`
- `channel_member_*`
- `chat_*` (`chat_created`, `chat_renamed`, `chat_member_*`)

### 13.2 UI bindings registry

The shared handlers in `client-core/events/handlers.ts` perform store mutations purely, but a few branches need to call into UI state (mark a session/channel/group as "done", redirect away from a deleted session, follow a continuation session into a new tab). They reach this via the `OrgEventUIBindings` interface from `client-core/events/ui-bindings.ts`. **Each app must call `setOrgEventUIBindings(...)` at boot — before the first `orgEvents` subscription opens** — or the handler will silently no-op those side effects.

Mobile bindings:
- `getActive*Id`/`setActive*Id` — read/write the mobile UI store (Zustand) keys for active session, session group, and channel.
- `markChannelDone` / `markSessionDone` / `markSessionGroupDone` — push into the badge state used by the Home tab.
- `openSessionTab` — no-op on mobile (no tab strip).
- `navigateToSession(channelId, groupId, sessionId)` — call `router.push("/sessions/${groupId}/${sessionId}")`.

---

## 14. Push Notifications

### 14.1 Registration

On first authenticated app launch:
1. Call `Notifications.requestPermissionsAsync()`.
2. If granted, get the Expo push token via `Notifications.getExpoPushTokenAsync()`.
3. Send to server via a new mutation `registerPushToken(token, platform)`. **Server change required** — see §18.
4. On sign-out or org switch: call `unregisterPushToken(token)`.

### 14.2 Server-driven notifications

Server sends push notifications for these events, targeted at the session owner or org members as appropriate:

| Event                                   | Notify           | Title                        | Body                          |
|-----------------------------------------|------------------|------------------------------|-------------------------------|
| `session_output` (question_pending)     | owner            | "Session needs input"        | {sessionName}: {question}     |
| `session_output` (plan_pending)         | owner            | "Plan ready for review"      | {sessionName}                 |
| `session_terminated`                    | owner            | "Session stopped"            | {sessionName}                 |
| `session_pr_opened`                     | owner            | "PR opened"                  | {sessionName}                 |
| `session_pr_merged`                     | owner            | "PR merged"                  | {sessionName}                 |
| `session_output` (recovery_failed)      | owner            | "Session errored"            | {sessionName}: {error}        |

All carry `data.deepLink = "trace://sessions/{groupId}/{sessionId}"`.

Debounce / coalescing: matches web behavior — 5s window per session to avoid storms on reconnection.

### 14.3 Foreground notifications

When app is foregrounded:
- Do NOT show a system banner.
- Do NOT haptic (event will already drive a UI update).
- The event arrives via subscription; the UI reflects the state change inline.

### 14.4 Badge counts

The app badge reflects the count of sessions in `needs_input` across the active org. Updated via foreground logic (from ambient subscription) and via server-side push payload `badge` field.

---

## 15. Milestones

### M0 — Foundations (no mobile UI yet)

- Extract `packages/client-core` from `apps/web/src/` per §7.
- Define Platform interface; implement web platform in `apps/web`.
- Add CI check: `client-core` has no web-specific imports.
- Web continues to work end-to-end.
- **Exit criteria:** web functionality unchanged; `packages/client-core` builds and is consumed by web.

### M1 — Mobile shell + auth

- `apps/mobile` scaffolded with Expo + dev client + EAS Build.
- Expo-router tabs, route tree from §9.
- Platform adapter for mobile: SecureStore, MMKV, RN fetch/WebSocket.
- Sign-in via GitHub OAuth (server change for `trace-mobile` origin + custom scheme).
- `/auth/me`, org hydration, org switcher.
- Empty screens for Home, Channels, Settings.
- **Exit criteria:** TestFlight build, sign in, see user's orgs, switch org.

### M2 — Design system + polish primitives

- All primitives in `components/design-system/` implemented and Storybook'd (via a single in-app `/__dev/design-system` route in dev).
- Liquid Glass component wired up (`expo-glass-effect` or custom module).
- Haptic wrapper implemented.
- Motion tokens + helpers implemented.
- **Exit criteria:** every primitive renders correctly in the V1 dark theme on iOS 17 and iOS 26, with no layout jank, and the token structure remains ready for a future light theme.

### M3 — Navigation, Channels & session group list

- Native-tab navigation skeleton (§9.2) and stack headers (ticket 15).
- Active Sessions bottom-accessory over iOS 26 `.tabViewBottomAccessory` (ticket 15a, §9.2.1).
- Expanded Session Player modal with three-detent gestures (ticket 15b, §10.8).
- Channels list screen.
- Coding channel screen with session group list.
- Settings + Org switcher (ticket 18).
- Status chips, live updates from `orgEvents`.
- **Exit criteria:** can browse to a session group from the Channels tab; the bottom accessory reflects live active sessions and expands into the player.

### M4 — Session stream (the big one)

- Session group detail screen + tab strip.
- Session stream screen (§10.6) with all node renderers.
- Input composer, send + queue flows.
- Queued messages strip.
- Pending-input bar (question, plan).
- Stop session action.
- Connection lost/restored handling.
- **Exit criteria:** full session interaction parity with web (minus file tree, terminal, checkpoints, rich editor).

### M5 — Home screen & push notifications

- Home feed with all three sections and live sort.
- Push notification registration + server support.
- Deep-link handling.
- Badge counts.
- **Exit criteria:** get a real push on iPhone when a session needs input; tap it and land on the session screen.

### M6 — Polish pass

- Motion review — every transition reviewed on a real device, tuned to feel right.
- Haptic review — every primary action tuned.
- Liquid Glass usage review on iOS 26 device.
- Accessibility audit: VoiceOver labels on every interactive element, Dynamic Type respected in Text primitive.
- Keyboard interaction review — every screen tested with keyboard up/down.
- Empty and error states on every screen.
- Performance instrumentation and budget validation against §16.
- **Exit criteria:** internal team can use the app as a daily driver for 1 week without feeling the polish gap, and any misses against §16 are fixed or explicitly documented before beta.

### M7 — Beta

- TestFlight external beta with a small group.
- Crash reporting (Sentry).
- Analytics hooks (product events, not telemetry).
- **Exit criteria:** <0.5% crash rate over 7 days; beta feedback incorporated or explicitly deferred.

---

## 16. Performance Requirements

- **Cold start to interactive:** <2s on iPhone 13 or newer.
- **Warm start to interactive:** <400ms.
- **Session stream scroll:** 120fps on ProMotion devices, 60fps on non-ProMotion. FlashList recycling must be effective — no sustained frame drops during rapid scroll through 1000+ events.
- **Event ingest:** UI reflects an event within 100ms of receipt from the WebSocket.
- **Input keystroke latency:** <16ms from touch to glyph rendered.
- **Memory:** <200MB RSS with a session of 1000 events loaded.

Instrumented via `expo-performance` or equivalent; checked in M6.

---

## 17. Quality, Testing, CI

### 17.1 Linting / typing

- ESLint with RN rules + the project's shared config.
- TypeScript strict mode.
- The `no any` rule (per CLAUDE.md) enforced.
- A custom rule preventing any import of `window`, `document`, `react-dom` in `packages/client-core`.

### 17.2 Tests

- **Unit:** event handler logic in `client-core/events/handlers.ts` — pure functions, high coverage.
- **Component:** `@testing-library/react-native` for critical primitives and the session stream.
- **E2E:** Maestro (or Detox) for sign-in + open session + send message — 1 smoke flow in M5.
- No snapshot tests.

### 17.3 CI

Extend the existing GitHub Actions pipeline:
- `pnpm lint`, `pnpm typecheck`, `pnpm build` for `apps/mobile` and `packages/client-core`
- EAS Build on PRs to `main` (preview profile) — optional but recommended.

---

## 18. Server-Side Prerequisites

These are new server work required for V1 mobile. They must land before or alongside mobile milestones.

1. **GitHub OAuth `trace-mobile` origin** — support a custom redirect scheme `trace://auth/callback?token=...` for `ASWebAuthenticationSession`. [Blocker for M1]
2. **Push notification registration mutations:**
   - `registerPushToken(token: String!, platform: PushPlatform!)` → Boolean
   - `unregisterPushToken(token: String!)` → Boolean
   - New enum: `PushPlatform { ios android }`
   - New table: `PushToken { id, userId, organizationId, token, platform, createdAt, lastSeenAt }`
3. **Server push dispatch** — APNs integration (via Expo Push Notification API is fine for V1). Service layer triggers pushes on the events listed in §14.2. [Blocker for M5]
4. **Universal link / Apple App Site Association config.** [Blocker for M5]

No changes to the event schema are expected. No changes to existing session mutations are required.

---

## 19. Open Questions & Risks

### Open questions

1. **Expo Modules API Liquid Glass package maturity.** `expo-glass-effect` or equivalent — does it cover all our usages (tab bar, input, pinned bars)? Decision: spike in M2; if gaps, write a thin custom Expo module. Budget: 1 day of Swift work.
2. **Assistant message rich rendering.** Decision for V1: render markdown + code blocks only; do not render images in the stream. If product wants image rendering, track it as a follow-up rather than expanding V1.
3. **Offline message behavior.** Decision for V1: do not build a durable offline outbox. If send/queue fails because connectivity is down, keep the draft visible in-session, surface retry affordances, and defer cross-launch draft persistence to a follow-up.
4. **File size cap enforcement.** Decision: yes. Enforce the <200-line rule in CI once the mobile app shape stabilizes (ticket 34).
5. **Dark mode only vs. light+dark.** Decision: V1 ships dark-only. Theme tokens stay structured so light mode can land later without rewriting consumers.

### Risks

- **Liquid Glass community package lag.** Mitigated by custom Expo module fallback.
- **client-core extraction breakage.** The extraction in M0 touches a lot of web files. Mitigation: staged landings, feature-flagged if needed, full web regression test before merging.
- **Push infrastructure.** APNs + Expo Push is a new dependency. Mitigation: start server work early (parallel to M1/M2).
- **AI-generated Swift in native modules.** The user isn't a Swift engineer; Liquid Glass wrappers are authored by AI. Mitigation: keep native module surface ≤5 small modules total; every one is <100 lines; each has a one-paragraph doc comment explaining intent.
- **Scope creep back into messaging.** Tempting to "just add DMs." Mitigation: treat any messaging work as a violation of V1 scope; defer to V2 RFC.

---

## 20. Success Criteria

V1 is shipped and successful when:

1. A Trace user on iPhone can go a full workday without opening the web app for session check-ins.
2. Every session interaction needed on-the-go (observe, answer, queue, stop, approve plan) is possible on mobile.
3. Polished enough that internal users describe it as "feels like a real iOS app," not "feels like a web wrapper."
4. No regressions in the web experience from the `client-core` extraction.
5. Crash-free sessions >99.5% over the first month of TestFlight.

---

## 21. Out-of-Scope Reference

A consolidated list, so there is no ambiguity about what V1 does not include:

- Messaging (channels with text messages, DMs, mentions)
- Tickets (any surface)
- Inbox
- Agent debug
- Terminals
- File tree / diff viewers in sessions
- Checkpoint detail views
- Starting new sessions from scratch
- Managing repos, projects, channel configuration
- Local (bridge) sessions — read-only indicator at most
- Light mode
- Android
- Image attachments in messages
- Rich text / slash commands in composer
- Org admin, billing, invitations
- Notification preference configuration (push is on if granted, off if not)
