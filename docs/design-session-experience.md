# Design Session Experience

Status: design exploration (2026-07-08). Companion to `managed-git-hosting.md`, which covers
where design-session code lives. This doc specs the user-facing experience, based on the
target mock:

![Design session mock](./assets/design-session-mock.png)

## The shape

A design session inverts the coding-session layout: the **live preview is the dominant
pane**, chat is a left rail, and code is invisible unless asked for. The header carries a
review status, cost badge, **Publish**, and **To code session**. The preview pane has a
version strip (v1…v4, visual diff), device-width toggles, zoom, pinned **comments**, and a
**Tweaks** panel for no-prompt design-token changes. The composer supports **element
references** — click a component in the preview, it becomes a chip attached to the prompt.

## Cloud-only in v1

Design sessions run **only on cloud (provisioned) runtimes** to start. This matches gates
that already exist — application/endpoint forwarding is cloud-only today
(`resolveCloudRuntime()` rejects local runtimes) — and buys a lot of simplification:

- **One runtime image.** The scaffold template, dev-server tooling, source-location Vite
  plugin, and headless-capture dependencies live in the cloud runtime image. No "does the
  user's laptop have node/playwright" story.
- **Permissive agent sandbox is safe.** The disposable machine is what makes aggressive
  auto-run (the fast prompt-to-preview loop) acceptable. A local design session would need
  a different, more conservative permission profile.
- **No local preview plumbing.** The iframe, proxy injection, and endpoint auth all ride
  the existing server-side proxy; a local variant would need a whole separate path.

Enforcement is at session creation, not scattered checks: when `kind === "web_design"`,
`SessionService.startSession` forces `hosting: cloud`, requires an environment with
`adapterType: provisioned`, and rejects local runtime selection. The UI simply doesn't
render the hosting/runtime picker for design sessions. Local support, if ever wanted, is a
later adapter-level project — nothing in this design precludes it.

## Standalone apps, agent-run

A design session does **not** run in the context of an existing org repo. It always starts
a brand-new application:

- **No `repoId` at creation.** Creation is prompt-first: `startSession(kind: web_design, prompt)`.
  Design sessions don't inherit the channel's default repo the way quick-create coding
  sessions do. The workspace begins as an empty directory on the cloud machine; the managed
  repo appears lazily at the first checkpoint (per the git-hosting doc).
- **The agent scaffolds and runs the app itself.** Repo `setupConfig`, setup scripts, and
  configured application processes are repo concepts — design sessions have none of them.
  The design agent profile owns the whole loop: pick the stack, scaffold, install, start
  the dev server, keep it alive. The runtime image bakes in a **starter kit** (Vite + React
  + Tailwind + shadcn, `trace.tokens.json`, the source-location plugin, pre-warmed
  node_modules) that the agent uses by default so first-preview is fast — but it's the
  agent's choice, not a fixed pipeline, so "make me a Next.js app" or a second app in the
  same workspace still works.
- **Port auto-detection replaces config-driven process start.** Since no config says what
  to run or on which port, the container bridge watches for new listening ports. When the
  dev server comes up, the bridge reports it, the service layer auto-creates and enables a
  `SessionEndpoint`, and the preview pane lights up — no user or config involvement. (The
  agent can also register explicitly via a tool call; detection is the fallback that makes
  it feel automatic.)

Template-dependent features degrade gracefully off-template: the Tweaks panel renders only
if `trace.tokens.json` exists; the element picker falls back to DOM selectors + screenshots
when source stamps are absent.

## Harness: Open Design, not bare Claude Code

Bare Claude Code produces functional-but-generic UI. The design quality layer comes from
[Open Design](https://github.com/nexu-io/open-design) (Apache-2.0): a design harness that
spawns coding-agent CLIs bound to `SKILL.md` workflows (100+ design skills — prototypes,
dashboards, decks) and `DESIGN.md` brand systems (150+ shipped: Linear, Stripe, Apple, …),
with a critique-before-emit loop. Its skills protocol is Claude Code's, adopted verbatim.

**Integration shape — extract the prompt layer, not the daemon.** Open Design's daemon
does three jobs; Trace already owns two (spawning/normalizing agent CLIs, persisting
conversations). What Trace lacks — and what we take — is the third: the layered prompt
composer (`composeSystemPrompt()`) and the content libraries. Its web UI, Electron shell,
SQLite store, and daemon process are all skipped; Trace's service layer, event stream, and
preview pane stay authoritative.

- The **composer is vendored** (Apache-2.0, attribution kept) into `packages/shared`, with
  Trace-specific additions in an overlay module so vendored files never diverge.
- The **skills + design-systems content** is baked into the runtime image from a pinned
  upstream tag — content sync is a pin bump, formats stay upstream-compatible.
- **No new tool**: design sessions run plain `claude_code`; the bridge composes the design
  prompt and passes it via `--append-system-prompt` (a small `RunOptions` extension).
- Full plan, spike checklist, and the daemon-embed alternative (still the fastest demo
  path) are in `open-design-harness-integration.md`.

What this buys beyond raw quality:
- **`DESIGN.md` as the org's brand system** — a design session can bind the org's own
  `DESIGN.md` (or one of the 150 presets), which is how outputs stop looking like every
  other AI-generated app. This pairs naturally with `trace.tokens.json`: `DESIGN.md`
  states intent, tokens carry the concrete values the Tweaks panel manipulates.
- **Critique loop** — the self-assessment pass before emitting fits the checkpoint model:
  critique runs before the checkpoint/capture, so versions in the strip are already
  vetted.
- **A path beyond apps** — Open Design's deck/image/video artifact skills give future
  session kinds (`deck_design`, …) the same harness for free.

Open question: when to build the critique panel (Open Design's weighted multi-role review
is orchestration we'd implement Trace-side) and whether v1 parses the discovery
question-form syntax into `QuestionBlock` or skips the brief entirely. Recommendation:
skip both in v1; first message is the brief.

## Mapping the mock to the architecture

Almost every element maps to an existing primitive. Three are genuinely new (marked ★).

| Mock element | Backing primitive | Status |
|---|---|---|
| Live preview iframe | `SessionEndpoint` + endpoint proxy | exists — needs iframe embed + auth |
| App boots with no config | agent-run scaffold + port auto-detection | ★ new |
| Versions v1…v4 | `GitCheckpoint` per run | exists — needs UI + per-version capture |
| Diff v3 | checkpoint diff / screenshot pair | exists (code diff); visual diff new |
| Element chip ("ApprovalTable › Row 2") | proxy-injected picker script | ★ new |
| Tweaks (no prompt needed) | deterministic token file edits via bridge | ★ new |
| Comments pinned to elements | events + queued messages | exists — needs anchor payload |
| Publish | endpoint `accessMode: public` | exists (v1); real deploy later |
| To code session | new session in same `SessionGroup` | exists |
| Code/Design mode toggle | `interactionMode` (add `design`) | small extension |
| $1.12 · 2.1M tok | Session token/cost fields | exists |
| In Review status | group status | later; not load-bearing |

### Versions = checkpoints

Every agent run already produces a `GitCheckpoint`. The version strip is the checkpoint
list renamed for civilians:

- **Only the latest version is live.** The dev server serves the worktree HEAD; the iframe
  always shows HEAD. Older versions are represented by **captures** taken at checkpoint
  time (full-page screenshot via the runtime, stored as an upload) — enough for the strip,
  hover previews, and visual diff.
- **Diff vN** = side-by-side / onion-skin of two captures, plus the existing code diff
  (`branchDiff`) behind a toggle for those who want it.
- **Restore** an old version = existing `restoreCheckpointId` machinery. Restoring makes it
  HEAD, so it becomes live again. No need to run N dev servers.

### ★ Element picker → prompt context

Trace owns the endpoint proxy, which is the unfair advantage: inject a small overlay script
into proxied HTML responses (dev-mode only). Clicking an element captures:

- DOM selector + bounding box + cropped screenshot
- React component name and source location — the starter kit includes a Vite plugin
  that stamps `data-trace-source="src/components/ApprovalTable.tsx:42"` on elements in dev
  builds, so the picker reads component identity directly from the DOM

The picker posts the payload to the parent frame (`postMessage`); the composer renders it
as a chip. On send, it serializes into the prompt as structured context
(`<attached-element file=… line=… selector=…>` + image). The agent gets a file:line, not a
guess — this is what makes "click the thing, say the change" reliable.

### ★ Tweaks: no-prompt design token edits

The starter kit exposes design tokens in one well-known file (`trace.tokens.json` →
CSS variables / Tailwind theme). The Tweaks panel edits token values through a service-layer
method that sends a `write_file`-style bridge command patching that file directly — **no
model round trip**. Vite HMR reflects it in <1s.

- Deterministic, instant, and free — the "Compact/Cozy" toggle is a token write, not a
  2-minute agent run.
- Changes land in the worktree like any other edit, so they're captured by the next
  checkpoint and visible to the agent as context.
- The panel's controls are driven by the token file's schema (template-defined), so
  templates can expose whatever knobs make sense.

### Comments

A pinned comment is an event (`design_comment_added`) scoped to the session, whose payload
carries the element anchor (selector + source location + version). "Send to agent" wraps it
into a queued message with the element attached — same pipeline as the composer chip. The
overlay script renders pins for comments anchored to the currently-visible version.

### Publish and graduation

- **Publish v1**: flip the endpoint to `accessMode: public` (exists today) and surface the
  URL. Later: real static deploy (build + upload to CDN) as a `publish` service method.
- **To code session**: start a coding-kind session in the same `SessionGroup` — sessions in
  a group already share the worktree. Pushing the managed repo to GitHub (graduation, per
  the git-hosting doc) is offered here but not required.

## New surface area

Frontend (`apps/web/src/components/design/`):
- `DesignSessionView` — shell; branches from the group route on `SessionGroup.kind`
- `PreviewPane` (iframe + device toggles + zoom), `VersionStrip`, `TweaksPanel`,
  `ElementChip` in the composer, comment pins overlay
- Chat rail reuses `SessionInput` / `SessionMessageList` as-is

Server:
- `SessionGroup.kind` (`coding | web_design`) + `StartSessionInput.kind`; the kind forces
  `hosting: cloud` (see "Cloud-only in v1") and takes no `repoId`
- Auto-create + enable a `SessionEndpoint` from bridge port-detection reports
- Checkpoint capture step (screenshot per checkpoint)
- Token-edit service method (validate against template schema → bridge write)
- `design_comment_added` event type
- Vendored Open Design prompt composer + overlay in `packages/shared`;
  `RunOptions.appendSystemPrompt` → `--append-system-prompt` in `ClaudeCodeAdapter` — see
  `open-design-harness-integration.md`; permissive sandbox auto-run (cloud machine is
  disposable)

Runtime/template:
- Starter kit baked into the runtime image (Vite + React + Tailwind + shadcn,
  `trace.tokens.json`, source-location Vite plugin, pre-warmed node_modules) — used by the
  agent by default, not a fixed pipeline
- Open Design skills + design-systems content baked into the runtime image from a pinned
  upstream tag
- Listening-port detection in the container bridge (reports new ports so the service layer
  can register endpoints)
- Proxy HTML injection for the picker/comments overlay (dev responses only)
- Iframe auth for private endpoints: short-lived signed cookie minted by the server when
  the preview pane loads, so previews are not world-readable

## Phasing

1. **Preview pane**: iframe embed of existing endpoints in the group view + private-endpoint
   iframe auth. Useful for coding sessions today; zero schema change.
2. **Design kind**: `kind` on SessionGroup (cloud-only, repo-less, enforced at
   `startSession`), `DesignSessionView` shell, starter kit + agent-run bootstrap + port
   auto-detection, vendored Open Design prompt composer + content in the image (per
   `open-design-harness-integration.md`), lazy managed repo (per git-hosting doc), version
   strip from checkpoints (code diff only).
3. **The magic**: element picker + chips, Tweaks/token edits, checkpoint captures + visual
   diff, comments.
4. **Distribution**: Publish (public endpoint → real deploy), Spotlight/share mode,
   review statuses.

## Open questions

1. Capture mechanics — headless screenshot on the runtime (Playwright in the image?) vs.
   client-side capture from the iframe. Runtime-side is more reliable; adds to image size.
2. Anchor durability — selectors + source stamps drift as the agent rewrites components;
   comments on old versions should pin to the *version they were made on* (capture), only
   best-effort re-anchor on HEAD.
3. How much of the picker/overlay ships in the template vs. injected by the proxy —
   injection keeps templates clean but must not break non-HTML/streaming responses.
