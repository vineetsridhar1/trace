# Open Design Harness: Extraction Plan

Status: integration plan (2026-07-08), v2 — supersedes the daemon-embed plan (kept as
Appendix A, still valid as a fast-demo spike). Companion to `design-session-experience.md`.
Based on reading [open-design](https://github.com/nexu-io/open-design) v0.14.1 source
(Apache-2.0).

## Decision

**Vendor the prompt composer and content libraries; do not run (or rebuild) the daemon.**

The daemon does three jobs. Trace already owns two of them:

| Daemon job | Trace equivalent |
|---|---|
| Spawn agent CLIs, normalize output streams | `CodingToolAdapter` + container bridge |
| Persist projects/conversations (SQLite, HTTP/SSE) | event store, sessions, worktree contract |
| Compose the layered design prompt + content library | **missing — this is what we take** |

Embedding the daemon would stack two normalization layers, add a supervised process, a
Node 24 constraint, and a shadow SQLite store — to use ~20% of an 8k-line server. The 20%
is not machinery: it's `composeSystemPrompt()` (~3.7k lines of mostly template strings
across `apps/daemon/src/prompts/`) plus static content (163 skills, 153 design systems).
Both are Apache-2.0 and nearly dependency-free.

A from-scratch rebuild of the prompt stack is the worst option — it would re-derive by
trial and error what upstream's 2,700 commits already encode. Vendor, don't rewrite.

## What gets vendored, and where

### 1. The composer → `packages/shared/src/design/vendor/`

- Copy `apps/daemon/src/prompts/` (system.ts, official-system.ts, discovery.ts,
  directions.ts, deck-framework.ts, panel.ts, media-contract.ts) essentially verbatim.
- Verified dependency surface (imports outside the module): `@open-design/contracts`
  (types/zod schemas — copy the small subset used) and `../media/models.js` (image model
  list feeding the media contract — stub it; v1 design sessions don't do media
  generation).
- Keep upstream file structure and names so rebases stay diffable. **Trace-specific
  additions never edit vendored files** — they live in a sibling overlay module
  (`packages/shared/src/design/trace-overlay.ts`) appended after the vendored stack:
  `trace.tokens.json` contract, element-chip context format, anything session-specific.
- Ship `LICENSE` + `NOTICE` (Apache-2.0 attribution) and a `VENDOR.md` recording the
  pinned upstream tag and the rebase procedure (diff `prompts/` between tags, re-apply).

### 2. The content → runtime image, not our git repo

- `skills/` and `design-systems/` (~320 directories) stay out of the Trace repo. The
  runtime-image build clones the pinned upstream tag and copies the two directories to
  `/opt/trace/design-content/`. Content sync = bump the pin. (The starter kit from the
  experience doc lives in the same image layer.)
- **Keep upstream file formats** (`SKILL.md` frontmatter, design-system `manifest.json` +
  `DESIGN.md` + `tokens.css` + `USAGE.md` + `components.manifest.json`) so upstream
  content drops in untouched and org-custom design systems follow a documented, stable
  format.
- A small loader in `packages/shared/src/design/` (ported subset of the daemon's
  `skills.ts` scanning logic) reads content from `TRACE_DESIGN_CONTENT_DIR` into
  `composeSystemPrompt()` inputs.

### 3. Delivery through the existing adapter — no new CodingTool

No `open_design` enum value, no new adapter, no daemon. Design sessions run plain
`claude_code`:

- The bridge, for `kind: web_design` runs, loads the selected design system + skills,
  calls `composeSystemPrompt()` + Trace overlay, and passes the result to the adapter.
- `RunOptions` gains `appendSystemPrompt?: string`; `ClaudeCodeAdapter` adds
  `--append-system-prompt <text>` when present. (Upstream's BYOK path sends the composed
  text as the API `system` param — same effect.) Other tool adapters can support the same
  option later; that's the whole multi-tool story.
- Discovery behavior: compose with the API-project variant (equivalent of
  `skipDiscoveryBrief` — first message is the brief). Later, keep the interactive
  question-form syntax and parse it into Trace's existing `QuestionBlock` /
  `AskUserQuestionBar` so the "quick brief" UX renders natively.

### 4. Trace-side plumbing (unchanged from v1 plan)

`designSystemId` / `skillIds` are design-session settings on the `SessionGroup`, passed
through the run command into `RunOptions`. UI: design-system picker in the design shell.
Org-custom `DESIGN.md` directories mount alongside the shipped content later.

## What we give up, and the mitigation

- **Critique panel orchestration** (weighted designer/critic/brand/a11y/copy roles, scored
  rounds) — the daemon's one piece of novel machinery. Off by default upstream anyway.
  When wanted, build Trace-side on our own agent plumbing as the pre-checkpoint quality
  gate; upstream's `contracts/critique` schemas are already in our vendored subset if we
  want config compatibility.
- **Free composer improvements on version bump** — replaced by periodic vendored rebase.
  Acceptable because we were always going to diverge (overlay layer above), and the
  fast-moving part of upstream is content, which stays drop-in.

## Spike checklist

1. Vendor `prompts/` + contracts subset into `packages/shared`; make it compile with the
   media stub. Snapshot test: compose (apple design system + a prototype skill) → prompt
   fixture. This fixture also anchors future rebases.
2. Image build stage: clone pinned tag, copy content dirs; loader reads a `SKILL.md` and a
   design-system manifest correctly.
3. Wire `appendSystemPrompt` through run command → `RunOptions` → `--append-system-prompt`.
4. End-to-end on a cloud machine: design prompt → scaffold → dev server → preview; A/B/C
   the same prompt across (a) bare claude, (b) claude + a static design prompt
   ([claude-design-system-prompt](https://github.com/Trystan-SA/claude-design-system-prompt),
   MIT — reverse-engineered, so benchmark-only pending a provenance check), (c) the full
   composed OD stack. (b)-vs-(c) measures what the composition machinery adds over prompt
   text alone; if the gap is small, v1 can ship (b) while the port proceeds. Its
   review-flavored skills (AI-trope detection, a11y audit) are cherry-pick candidates for
   our content dir regardless.

## Risks

- **Rebase drift** — vendored composer diverges from upstream. Mitigated by: never editing
  vendored files (overlay only), `VENDOR.md` pin + procedure, snapshot fixtures that make
  behavior changes visible in review.
- **Prompt-stack coupling** — some composer inputs assume daemon-side state (memory,
  plugins, craft sections). v1 passes `undefined` for those; verify the composed output
  degrades cleanly (upstream already treats them as optional).
- **License hygiene** — Apache-2.0 requires attribution: NOTICE file in the vendored dir
  and in the runtime image with the content.

---

## Appendix A: daemon-embed alternative (fast-demo spike)

Superseded as the production path, but the quickest way to a quality demo (~days) with
zero porting. Summary of the validated approach:

- Bake the daemon (pinned tag, their `deploy/Dockerfile` pattern, Node 24, no web UI) into
  the runtime image; bridge runs it loopback-only on `:7456` (`OD_DATA_DIR` under
  `/var/trace`), **excluded from port auto-detection**.
- `OpenDesignAdapter implements CodingToolAdapter`: register the worktree via
  `POST /api/import/folder { baseDir, orchestratorWorkspace: { kind: "scratch",
  writeback: "external" } }` (their explicit external-orchestrator contract — no VCS on
  their side), then `POST /api/chat { projectId, conversationId?, message, agentId:
  "claude", model, skillIds, designSystemId }` and map SSE `agent` events
  (`text | thinking | tool_use | tool_result | result`) onto `ToolOutput`; terminal `end`
  → `onComplete()`; `POST /api/runs/:id/cancel` on abort; reconnect with `Last-Event-ID`.
- Create projects with `skipDiscoveryBrief: true`. Resume = `projectId:conversationId` in
  `toolSessionId` (daemon handles claude `--resume` internally).
- Not used: `od mcp` mode (our agent calling `start_run` would spawn a second agent —
  recursive), exports (need desktop Chromium), media generation, web UI.
