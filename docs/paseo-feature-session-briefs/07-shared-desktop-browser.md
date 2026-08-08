# Session Brief: Shared Human-and-Agent Desktop Browser

## Assignment

Add visible browser tabs inside Trace Desktop that a human and an explicitly authorized AI can share
and control. The browser should use a persistent user profile so normal logins survive, while Trace
retains server-authoritative tab state, permissions, and events. This is different from Trace's
existing cloud Playwright proof flow, which should remain isolated and unchanged.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Product example

1. A user opens a “Browser” tab in a Trace session group and logs into a development app.
2. The tab is visible in Trace Desktop and remains authenticated across app restarts.
3. The user enables “Allow this session's agent to control this tab.”
4. The agent runs `trace browser snapshot`, clicks a button, and types into a form.
5. The user watches, can take control immediately, and can revoke agent control without closing the
   tab or deleting the profile.

## Current Trace and Paseo context

- Trace Desktop is currently a thin Electron shell plus runtime bridge; external URLs are not a
  shared, controllable browser-tab product.
- Trace's container browser-video skill uses isolated Playwright sessions for deterministic cloud
  proof. Do not turn that safety-focused flow into the persistent personal browser.
- Paseo has desktop-hosted persistent Electron webviews plus browser tools routed through its daemon.
  Its concepts of visible tabs, stable element references, screenshots, navigation, click/type,
  waits, and explicit routing are useful references.

## Required architecture

1. Introduce a server-owned browser-tab service and schema keyed to organization, user profile,
   session group, and selected browser host/runtime. Mutations create events; resolvers are thin.
2. Define a pluggable `BrowserHostAdapter` (or equivalent) so V1 can use Trace Desktop while a future
   cloud host can remain isolated. Vendor/Electron details stay in the desktop adapter.
3. Render tabs with the Electron browser primitive that best meets current security guidance. Keep
   browser content isolated from Trace renderer privileges: no Node integration, narrow IPC, context
   isolation, navigation/download/pop-up policies, and no arbitrary preload access.
4. Use a persistent Electron session partition scoped to the signed-in Trace user/device profile,
   not organization-global and not agent-owned. Provide an explicit “clear browser data” action.
5. Synchronize tab metadata (URL, title, loading, owner/host, control status, last activity) through
   services/events. Browser cookies, local storage, credentials, and full DOM must remain on the
   browser host and must not be copied into events or central persistence.
6. Add a typed bridge command set: list/open/close/focus/navigate/back/forward/reload, accessibility
   snapshot, screenshot, click, type/fill, select, press, scroll, and bounded wait. Do not expose
   arbitrary Electron IPC or unrestricted JavaScript evaluation in V1.
7. Use snapshot-generated short-lived element references. Bind refs to tab + document/navigation
   generation and reject stale refs after navigation or meaningful DOM refresh.
8. Human control is always available. Agent control is opt-in per tab or session group, visibly
   indicated, immediately revocable, and authorized using the restricted session credential from
   the CLI brief. A session may not enumerate or control unrelated personal tabs.
9. Add GraphQL/service operations for app clients and CLI browser commands for agents. Large
   screenshots should use a bounded binary/artifact transport rather than event payloads/base64 in
   normal entity state.
10. Restrict schemes to safe explicit choices (normally `http`/`https`; optionally a separately
    justified localhost/file policy). Validate downloads/uploads and never allow an agent to choose
    arbitrary host filesystem paths.

## Concurrency and lifecycle

- Define one controller lease at a time while all permitted clients can observe state. Human action
  can preempt the agent; operations return a clear control-lost result.
- Restore tab metadata after desktop restart only when the owning user reconnects. If the host is
  offline, show the tab as unavailable rather than silently moving its profile to another machine.
- Close/revoke cleanup must release control leases and element refs. Clearing profile data is a
  separate explicit destructive action.

## Completion criteria

- A user can create, view, navigate, focus, close, and restore a persistent-profile browser tab in
  Trace Desktop.
- After explicit grant, a scoped agent can snapshot, screenshot, click, type, press, scroll, wait,
  and navigate that visible tab using CLI/service operations; revocation takes effect immediately.
- The agent cannot see/control another user, org, group, ungranted tab, cookies, credential values,
  arbitrary files, privileged IPC, or raw JavaScript execution.
- Element references expire correctly across navigation and stale-ref behavior is tested.
- Human preemption, desktop offline/reconnect, tab close, app restart, pop-up, download, upload,
  disallowed scheme, timeout, and host crash have explicit tested behavior.
- Events contain safe tab metadata and actor attribution, never screenshots, DOM dumps, cookies,
  credentials, or form contents.
- Existing cloud browser-video isolation and cleanup tests continue to pass.
- Desktop adapter, bridge, service, GraphQL, CLI, store, and UI tests pass.

## Likely touchpoints

- `apps/desktop/src/main.ts`, preload/IPC, and bridge modules
- new desktop browser host/tab modules
- `apps/server/src/services/` browser-tab service
- `apps/server/src/lib/session-router.ts` or a dedicated browser-host router
- `packages/gql/src/schema.graphql`
- `packages/client-core` entity/event handling and selectors
- desktop/web session UI and Trace CLI browser commands

Do not add autonomous browsing orchestration, hidden personal-browser control, cross-device cookie
sync, a generic remote-debugging port, or provider ecosystem work in this session.
