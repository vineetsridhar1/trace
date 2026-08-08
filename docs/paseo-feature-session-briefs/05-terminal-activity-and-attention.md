# Session Brief: Terminal Activity and Attention

## Assignment

Add a source-agnostic activity model for Trace terminals so every client can see whether a terminal
is working, idle, waiting for user input, or demanding attention. Feed it with explicit runtime
signals and opt-in coding-provider hooks. Do not infer state by parsing arbitrary terminal output.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Product example

- A terminal tab shows a spinner while Codex/Claude is processing.
- The session sidebar shows an attention badge when a permission prompt needs a response.
- Mobile receives the same state and can open the relevant terminal.
- If hooks are disabled or unsupported, the state is `unknown`; Trace does not guess.

## Current Trace and Paseo context

- Trace already knows terminal identity, session/channel ownership, runtime placement, and active
  clients, but it has no provider-neutral activity state.
- Paseo's reference is `/Users/vineet/programming/paseo/docs/terminal-activity.md`: a central tracker,
  states such as unknown/working/idle/needs-input/attention, terminal-scoped activity credentials,
  and opt-in Claude/Codex/OpenCode hooks.
- Provider hook formats differ and change. Their parsing/configuration belongs in adapters.

## Required design

1. Define a terminal activity snapshot with terminal ID, state, reason code, source/provider,
   observed-at time, and optional safe display text. Settle on a minimal state machine, preferably
   `unknown`, `working`, `idle`, and `needs_input`; represent higher urgency as a reason/severity
   instead of duplicating ambiguous states unless product evidence requires it.
2. Create a `TerminalActivityTracker` owned near the terminal relay/directory. Transitions must be
   source-agnostic, validated, monotonic enough to reject stale signals, and distributed to other
   server replicas/clients.
3. Issue a random, short-lived, terminal-scoped activity credential when a terminal is created. The
   credential may report activity for that terminal only; it cannot read output, send input, access
   GraphQL, or control other terminals. Store/compare it safely and redact it everywhere.
4. Provide a narrowly typed runtime ingestion endpoint or bridge message. Enforce size, rate, state,
   terminal, expiry, and origin constraints. A stale/closed terminal must reject updates.
5. Add provider hook adapters for currently supported tools where stable hooks exist. Hook commands
   should be injected with terminal ID, endpoint, and credential via environment or protected config,
   not command-line logs.
6. Hook installation is explicit opt-in. Preserve existing user provider configuration, use marked
   idempotent entries, support uninstall, survive repeated installs, and fail open so provider work
   is never blocked by Trace activity reporting.
7. Publish live activity through the existing terminal/session subscription architecture and store
   it in Zustand with fine-grained selectors. Do not persist every activity pulse as an immutable
   event. A durable notification may be emitted only for a separately justified user-attention
   transition and must deduplicate flapping.
8. Add terminal-tab and session/sidebar indicators with accessible labels. Define timeout behavior:
   working signals eventually become `unknown` or `idle` after a documented heartbeat/staleness
   interval, never remain stuck forever.

## Provider mappings to test

- User prompt / pre-tool / post-tool can map to `working` where the provider semantics support it.
- Stop/completion maps to `idle`.
- Permission or explicit prompt-for-input maps to `needs_input`.
- Unsupported or unrecognized events are ignored safely and recorded only as sanitized diagnostics.

## Completion criteria

- Activity from an authorized hook changes the correct terminal and appears live in desktop/web and
  mobile-facing state.
- A credential for terminal A cannot update B or control/read A; expired and malformed signals fail.
- Working, idle, needs-input, stale timeout, duplicate, and out-of-order transitions are tested.
- At least Codex and Claude hooks are supported if their installed versions expose stable hooks;
  otherwise the unsupported result and exact evidence are documented without brittle workarounds.
- Install/uninstall is opt-in, idempotent, preserves unrelated user config, and a broken Trace
  endpoint never blocks the coding tool.
- No terminal output parsing, provider secret exposure, or high-frequency immutable event spam is
  introduced.
- Tracker, ingestion, hook adapter, distribution, store, and UI tests pass.

## Likely touchpoints

- terminal relay/directory and bridge protocol
- coding-tool launch adapters and environment construction
- provider-specific hook installers in desktop/container runtimes
- GraphQL/subscription types if the existing runtime stream cannot carry snapshots
- `packages/client-core` terminal state/selectors
- terminal tab, session list, and mobile indicators/settings

Do not add terminal capture/control here beyond consuming its established identity model.
