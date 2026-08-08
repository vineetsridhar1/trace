# Paseo Control Plane Deep Dive and Trace Port Plan

Status: proposed architecture and delivery plan  
Reviewed: 2026-08-08  
Paseo source: `/Users/vineet/programming/paseo` at `3d420720c5fdd42ae6332b2e133b4a2c34811985`  
Trace source: `3dd086c414d7fbdf959ac91d0b74736d72494e7a`

## Executive recommendation

Port Paseo's **control-plane pattern**, not its daemon architecture or source code.

Trace already has most of the hard execution substrate that Paseo had to build locally:

- service-owned sessions, messages, projects, tickets, channels, and events
- local and cloud runtimes behind `SessionRouter`
- worktree and linked-checkout operations
- interactive terminals and managed application processes
- an authoritative event timeline with subscriptions and pagination
- queueing, steering, forking, checkpoints, artifacts, and approvals
- organization, visibility, and runtime-access authorization

What Trace does not have is the layer that makes those capabilities safely callable by an AI or a
real command-line client:

- no transport-neutral action catalog
- no MCP server
- no general Trace CLI; the current CLI only uploads artifacts
- no session-scoped control identity or capability grant
- no parent/child delegation model or durable completion notification
- no explicit per-turn lifecycle for `wait` and cancel-without-closing
- no schedules, heartbeats, or bounded agent loops
- no normalized permission broker or shared in-app browser host

The recommended shape is:

```text
Human app ──GraphQL──────────────┐
Human CLI ──MCP/control client───┤
External AI ──MCP───────────────┤
In-session AI ──MCP/native──────┤
                                ▼
                     ControlActionCatalog
                   validate · authorize · route
                                │
                                ▼
                     Existing service layer
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
         Event store       SessionRouter       Other services
                                │
                       local/cloud bridges
```

The first useful release should let a running Trace session create or reuse another session, send it
work, inspect it, wait briefly, cancel its current turn, and receive a durable completion
notification. That proves the self-orchestration loop before adding automation breadth.

## Scope and evidence

This analysis covered Paseo's server, protocol, public client, CLI, desktop host, relay, provider
adapters, persistence, schedules, loops, browser tools, voice path, and orchestration skills. The
most important source paths were:

- `packages/server/src/server/agent/tools/paseo-tools.ts`
- `packages/server/src/server/agent/mcp-server.ts`
- `packages/server/src/server/agent/runtime-mcp-config.ts`
- `packages/server/src/server/agent/agent-manager.ts`
- `packages/server/src/server/agent/agent-prompt.ts`
- `packages/server/src/server/bootstrap.ts`
- `packages/server/src/server/session.ts`
- `packages/server/src/server/schedule/`
- `packages/server/src/server/loop-service.ts`
- `packages/server/src/server/browser-tools/`
- `packages/protocol/src/`
- `packages/client/src/daemon-client.ts`
- `packages/cli/src/`
- `packages/relay/src/`
- `docs/architecture.md`, `docs/agent-lifecycle.md`, `docs/data-model.md`, and
  `docs/timeline-sync.md`

The Trace comparison covered the GraphQL schema, Prisma schema, service layer, EventService,
SessionRouter, local and provisioned runtime adapters, desktop/container bridges, coding-tool
adapters, terminal relay, runtime bundle, and `SESSION_AUTOPILOT_PLAN.md`.

One licensing constraint matters before implementation: Paseo is AGPL-3.0 while Trace is
FSL-1.1-ALv2. This plan describes behavior and architecture for an independent implementation. It
does not recommend copying Paseo code. Any direct reuse needs an explicit licensing review.

## What Paseo actually is

Paseo is a local-first agent supervisor. A Node daemon owns coding-agent processes, local workspace
state, the authoritative agent timeline, terminals, schedules, loops, provider discovery, and remote
connectivity. Desktop, mobile, web, and CLI clients all speak the same WebSocket protocol to that
daemon.

```text
Expo app       Desktop app       CLI       Remote device
   │               │              │              │
   └───────────────┴──── WebSocket/relay ────────┘
                              │
                         Paseo daemon
                 ┌────────────┼────────────┐
                 │            │            │
             AgentManager  Workspace/PTY  Automation
                 │
       provider-specific agent clients
```

Agents continue running when clients disconnect. The desktop app can start and supervise the daemon
as a child process. A headless CLI installation can do the same.

### The MCP server is an adapter, not the product core

Paseo's most reusable decision is that tools are not implemented inside MCP handlers.
`createPaseoToolCatalog()` builds a map of definitions containing:

- a stable tool name
- title and model-facing description
- Zod input and output schemas
- a handler that receives host dependencies and an abort signal

The MCP server loops over that catalog and registers each definition. The same catalog can be
injected natively into a provider that supports host tools. At present, OMP is the concrete
native-tool implementation; other providers receive the catalog through an injected MCP server.

The endpoint is stateless Streamable HTTP. Each POST creates a fresh MCP server and transport,
handles the request, and tears them down. GET and DELETE return 405 because there is no retained MCP
session state.

This separation gives Paseo three useful properties:

- business behavior does not depend on MCP
- MCP and native provider tools can reach parity
- tests can execute the catalog without an HTTP transport

### MCP does not literally expose the whole app

The claim that Paseo can control the whole app is directionally true across its CLI and WebSocket
client, but the MCP surface itself is curated.

The catalog currently has 38 non-voice control tools, an optional `speak` tool, and 22 opt-in
browser tools—a maximum of 61. It covers:

- agent create/send/status/list/cancel/archive/kill/update/activity/mode
- workspace create/list/rename/archive
- workspace script list/start/stop
- terminal list/create/kill/capture/send-keys
- schedule create/list/inspect/update/pause/resume/delete/logs/run-once
- heartbeat create/delete
- provider/model inspection
- pending permission list/respond
- optional voice output

The broader CLI and `DaemonClient` also cover chat rooms, imports, attach/log streams, daemon
lifecycle and pairing, loops, file operations, Git and pull-request operations, project discovery,
configuration, diagnostics, provider usage, and Hub features. Those are not all MCP tools.

The lesson for Trace is to promise **one canonical action semantics**, not immediate exposure of every
administrative feature to every agent.

## How Paseo makes agents control Paseo

### Runtime tool injection

When Paseo launches an agent, it provides:

- `PASEO_AGENT_ID`
- `PASEO_AGENT_CWD`
- a runtime-only MCP server named `paseo`
- the agent ID in the MCP URL as `callerAgentId`
- a bearer capability generated for that daemon run

The internal MCP entry is stripped before agent configuration is persisted. This prevents a stale
daemon URL or token from becoming durable provider configuration.

If a provider advertises native Paseo tool support, `AgentManager` supplies the catalog directly and
removes the internal MCP entry to prevent duplicate tools.

### Caller-aware placement

Paseo uses the caller's agent ID to derive sensible delegation defaults:

- agent-scoped creates run in the background by default
- a child uses the caller's workspace unless another workspace is explicit
- the child receives a `paseo.parent-agent-id` label
- provider-specific options can be inherited when the provider matches
- path selection is constrained by the caller context
- follow-up prompts can notify the caller when they finish

The CLI mirrors this context inheritance. `paseo run` resolves workspace placement in this order:

1. explicit `--workspace`
2. the current agent from `PASEO_AGENT_ID`
3. the current workspace terminal from `PASEO_WORKSPACE_ID`
4. explicit new-workspace mode
5. a new local workspace for the current directory

This small environment convention is what lets an AI shell out to `paseo` without manually passing
its own identity and workspace on every call.

### Parent/child orchestration

Paseo distinguishes full Paseo-managed child agents from provider-native subagents:

- Paseo children are ordinary independently controllable agents linked by a parent label.
- Provider-native subagents are normalized as read-only child descriptors and timelines.
- The UI merges both into a subagent track.
- Detach removes the parent label without stopping the child.
- Archiving a parent cascades to Paseo-managed children.
- Closing a subagent tab only changes layout; it does not archive the child.

Creation and follow-up default to background execution for agent callers. A one-shot finish
subscription watches the child for running followed by idle, error, or permission request. It then
sends a system-wrapped message to the caller containing the child ID, title, outcome, and most recent
assistant message.

That notification is ergonomically excellent, but its implementation is in-memory and therefore not
durable across daemon restart. Trace should preserve the behavior while implementing delivery as
persisted state plus events.

### Wait without pathological polling

Paseo also provides blocking calls for workflows that truly need them. Its MCP wait imposes a
30-second application timeout before the MCP SDK's 60-second timeout. A timeout returns a friendly
status and curated recent activity; it explicitly does not imply agent failure.

This produces a good agent contract:

- prefer background execution and finish notifications
- use short waits when sequencing is necessary
- inspect curated recent activity instead of dumping an entire transcript
- do not busy-poll

### Lifecycle and timeline

Paseo separates persistent agent lifecycle from a foreground turn:

- agent lifecycle: `initializing`, `idle`, `running`, `error`, `closed`
- archive is a separate soft-delete timestamp
- an active foreground turn has its own ID and start time
- cancellation targets the turn, not the durable agent identity

The timeline has two paths:

- live WebSocket events for immediacy
- authoritative paginated history for correctness

Rows carry epoch and sequence coverage. Clients detect gaps, page forward until complete, and replace
or reconcile projected rows rather than assuming the live stream is durable. Tool output is bounded
before it reaches either path.

Trace's event store already provides the stronger persistence foundation, but Trace lacks the
explicit turn record needed to model `running`, cancel, wait, and completion consistently.

## The rest of Paseo's capability surface

### CLI and client SDK

The Commander-based CLI is a real automation surface, not a wrapper around a few scripts. It has
human-readable tables plus JSON/YAML/quiet output, remote `--host` targeting, stable exit behavior,
foreground/background execution, streaming attach/logs, and structured-output mode validated
against a JSON schema.

`@getpaseo/client` is the shared WebSocket client used by the app and CLI. It handles handshake,
request correlation, timeouts, reconnect behavior, timeline subscriptions, terminal binary frames,
and nearly every daemon operation. The SDK facade is still evolving, but the architectural boundary
is real.

### Protocol and compatibility

The WebSocket protocol has:

- a hello containing client ID, client type, protocol/app version, and capabilities
- server information containing server version, features, and capabilities
- application ping/pong every ten seconds
- a hard 8 MiB outbound high-water mark
- roughly 60-second RPC timeouts
- JSON control messages plus binary terminal/file-transfer frames
- append-only schema evolution and explicit compatibility tags

Trace already has GraphQL code generation, subscriptions, and a separate bridge protocol. It does not
need another all-purpose client protocol. Only streaming CLI features need a client facade over the
existing GraphQL and terminal transports.

### Workspaces, worktrees, scripts, and services

Paseo's workspace is the unit that owns tabs and agent sessions. It can point at the current checkout
or an isolated worktree. A project registry groups workspaces by repository root.

`paseo.json` defines named scripts. A service script receives an assigned port and a stable proxy
hostname. Setup and teardown hooks accompany worktree lifecycle. Terminals are workspace-scoped and
their output can be captured or controlled through tools.

Trace's closest equivalent to a Paseo workspace is `SessionGroup`, not `Project`:

- `SessionGroup` owns the shared branch, workdir, worktree, runtime connection, setup state, app
  processes, endpoints, and multiple sessions.
- Trace `Project` is a long-lived planning/collaboration entity that links peer entities.
- Trace `Repo` corresponds to much of Paseo's project registry.

Confusing these mappings would make orchestration fight Trace's flat-entity model.

### Persistent schedules and heartbeats

Paseo schedules store cron cadence, timezone, expiry, run limits, provider/model configuration, and
logs. Each scheduled occurrence creates a fresh agent. Interrupted scheduled runs are reconciled on
daemon restart.

Heartbeats differ intentionally: they prompt an existing long-lived agent on a cadence. That
distinction is useful for Trace as well:

- schedule: new isolated execution each time
- heartbeat: wake an existing conversational session

### Bounded loops

`paseo loop` is a durable, inspectable retry primitive. Each iteration creates a worker and can run:

- shell verification commands
- a separate verifier agent with a structured pass/fail result
- iteration and wall-clock limits
- a sleep interval
- optional child archival

The loop stores iteration records and ordered logs. A running loop becomes stopped after daemon
restart rather than silently resuming. This is much safer than an unbounded prompt that tells an
agent to retry forever.

Trace's Project Orchestration RFC is the right eventual home for multi-ticket DAG execution. A small
bounded loop remains useful as a lower-level acceptance-criteria primitive, but it should share
ProjectRun/TicketExecution concepts when those exist rather than becoming a competing orchestrator.

### Permission normalization

Provider adapters normalize provider-specific permission prompts into one Paseo request model. The
client can list pending requests and answer an exact option. ACP chooser semantics, Claude/Codex
policies, Pi extension dialogs, and OpenCode permissions remain provider-owned at the adapter edge.

Trace currently normalizes coding-tool output but does not expose a common service-level permission
request lifecycle. That prevents a control agent from reliably unblocking another session.

### In-app browser automation

Paseo desktop owns persistent Electron webviews. The daemon's browser broker routes an agent tool
call to a connected desktop host. Browser access is opt-in and workspace-scoped.

The 22 browser tools cover tab lifecycle, accessibility snapshots and temporary element refs,
click/fill/type/key/hover/select/drag/upload/scroll, navigation, viewport resize, screenshots,
console/network logs, waiting, and JavaScript evaluation. File uploads are constrained to the
workspace. All tabs share a persistent desktop profile, including cookies and login state.

Trace has a cloud Playwright CLI and browser-video proof workflow, but it does not have Paseo's
shared visible browser tabs or desktop broker. This is an advanced feature, not a dependency for the
control-plane MVP. Trace should extend its existing browser-runtime work instead of porting Electron
webview code.

### Voice

Paseo supports streamed dictation and a realtime voice-agent mode. A session-bound `speak` tool can
send audio back through the client that owns the voice context. Trace does not have an equivalent
voice control surface. This is independent of core orchestration and should remain a later product
decision.

### Remote access and pairing

Paseo's optional relay uses Curve25519 key agreement and XSalsa20-Poly1305 encryption. The relay
routes ciphertext and does not possess plaintext keys. Pairing transfers host information and a
public key by URL/QR. Direct TCP, Tailscale, and self-hosted relay paths are also supported.

Trace already uses a central server to connect web, mobile, desktop, and cloud/local runtimes. It
should not add a second Paseo-style relay merely for MCP or CLI. A direct local-only/private-host
product mode could justify E2E relay work later, but that is a separate deployment decision.

### Provider discovery

Paseo has a richer provider contract than Trace:

- multiple direct and ACP-backed providers
- runtime availability checks
- model, mode, thinking-option, and feature discovery
- provider-specific option schemas and permission mappings
- custom binaries, environment, model lists, and API endpoints
- import of provider-native sessions and history
- provider usage inspection

Trace currently has Claude Code, Codex, Pi, Cursor Composer, and Antigravity adapters, but the shared
adapter interface is only `run`, `abort`, and optional resume ID. Model choices are mostly static in
`packages/shared/src/models.ts`. Provider catalog expansion is valuable, but it should not block the
first control actions.

### Skills as product workflows

Paseo ships skills that compose primitives into recognizable workflows:

- handoff
- loop
- advisor
- committee

The tools make orchestration possible; the skills teach models when and how to use them. Trace will
need both. Adding MCP without adding short, tested Trace orchestration skills will leave much of the
value undiscoverable.

### Additional product and operations deltas

The control plane is the high-value gap, but Paseo also has a long tail of product capabilities that
should be tracked separately so “parity” does not hide them:

| Paseo capability | Trace comparison | Port decision |
| --- | --- | --- |
| Multiple simultaneous desktop windows | Trace desktop currently owns one main window | Later desktop UX improvement; unrelated to agent control |
| Full UI internationalization and translated docs | No comparable first-class i18n layer found | Separate localization initiative |
| Provider-native session discovery/import | Trace resumes sessions it owns but does not browse/import external histories | Add through richer provider adapters after control MVP |
| Rewind in place to a timeline message | Trace has event/checkpoint-based fork, not general destructive rewind | Prefer non-destructive fork; add rewind only with clear provider and event semantics |
| Provider slash-command discovery | Trace does not normalize provider commands | Later provider catalog field |
| Provider usage/quota inspection | Trace tracks session token/cost, not provider plan windows or balances | Separate settings/observability feature |
| Custom provider binaries/endpoints/profiles | Trace adapters and models are mostly compiled/static | Add after the runtime catalog contract is stable |
| Repository discovery, GitHub search, clone, and project icons | Trace configures repos and cloud runtimes clone them, but lacks Paseo's full host-project browser | Extend repo onboarding, not the MCP foundation |
| General file upload/download subscriptions | Trace has scoped list/read/write and UI browsing, but not an equivalent public SDK surface | Expose only guarded, scoped operations as needed |
| Terminal attention inferred from provider hooks | Trace terminals do not report agent-style working/idle/needs-input state | Optional opt-in hook system that preserves user config |
| Host diagnostics and daemon update commands | Trace has runtime diagnostics and desktop updates, but no unified control CLI for them | Human/admin CLI only; never a default agent capability |
| Multiple saved daemon hosts | Trace represents runtimes/environments through the central organization | Keep Trace's model instead of copying host registries |
| Self-hosted UI served by one local daemon | Trace has a deployable server/web stack, not Paseo's single local bundle | Deployment/packaging choice, not control semantics |
| Optional Hub and daemon-outbound workflows | Trace's central server/project model occupies much of this role | Do not port Hub as a second control authority |
| Agent/human rooms with mention wakeups | Trace already has channels, chats, threads, and event-driven messaging | Expose existing services instead of adding Paseo rooms |
| Selective timeline hot-set and durable display cache | Trace already uses viewport-driven subscriptions and partitioned event state | Preserve Trace client architecture; close measured offline gaps separately |
| Focus-aware push notifications | Trace has mobile push, but not delegation-specific finish notifications | Route durable delegation events through the existing notification service |
| Community skins and VS Code extension ecosystem | No direct Trace equivalent | Ecosystem work after a stable public control API exists |

These items should not be bundled into one “Paseo parity” project. Most have different owners,
security boundaries, and success criteria.

## Capability gap matrix

Legend: **yes** means Trace has a comparable or stronger primitive; **partial** means the substrate
exists but is not safely agent/CLI controllable; **no** means a new product capability is required.

| Capability | Paseo | Trace today | Recommended Trace treatment |
| --- | --- | --- | --- |
| Transport-neutral action catalog | Yes | No | Build first; handlers call services only |
| Streamable HTTP MCP | Yes | No | Add as a thin action-catalog adapter |
| Full application CLI | Yes | No; artifact upload only | Replace/extend runtime CLI with control commands |
| Shared typed client | Yes | Partial GraphQL/client-core | Add a small control client; reuse GraphQL streams |
| Agent caller context | Yes | Partial session/invocation env | Add scoped control context and token |
| Runtime MCP injection | Yes | No | Add per coding-tool adapter after CLI fallback |
| Provider-native host tools | One provider | No | Later optimization over the same catalog |
| Session create/send/list/get | Yes | Yes for users, partial for agents | Expose service-backed control actions |
| Background delegation defaults | Yes | No | Default child work to background |
| Parent/child relationship | Yes | No | Add a durable peer link, not containment |
| Finish notification to caller | Yes, transient | No | Persist a one-shot completion subscription |
| Agent/subagent UI track | Yes | No | Merge managed children with provider-native children later |
| Short wait with recent activity | Yes | Timeline exists | Add event-backed wait action with bounded output |
| Explicit turn lifecycle | Yes | No | Add `SessionTurn` or equivalent invocation record |
| Cancel current turn, keep session | Yes | Bridge substrate only | Add service action/event using adapter abort |
| Stop/archive/delete session | Yes | Yes | Expose with conservative capabilities |
| Resume provider session | Yes | Yes | Expose after authorization normalization |
| Import external provider history | Yes | No | Later provider-adapter feature |
| Rewind/fork from history | Yes | Fork is strong; no general rewind | Keep Trace fork; add rewind only if product need is clear |
| Worktree isolation | Yes | Yes | Reuse SessionGroup/SessionRouter |
| Shared workspace among agents | Yes | Yes | Use SessionGroup as the placement unit |
| Adopt existing worktree | Yes | Yes | Expose after path/runtime authorization review |
| Setup scripts | Yes | Yes | Expose existing service |
| Managed app/service processes | Yes | Yes, richer artifacts/endpoints | Expose existing service in phase 3 |
| Terminal list/create/kill | Yes | Yes for app users | Adapt service actor/context signatures |
| Terminal capture/send keys | Yes | Partial relay/scrollback | Add authorized service methods over ring buffer/input |
| Terminal activity hooks | Yes | No | Optional later provider-hook feature |
| File read/write/download | Yes | Bridge support exists | Expose guarded operations, never raw bridge commands |
| Git status/diff/commit/branch | Yes | Mostly yes | Expose curated managed-git/checkpoint actions |
| PR operations | Yes | Partial | Keep provider-neutral and service-owned |
| Channels/chat/messages | Chat rooms | Trace is stronger | Expose Trace channels/chats through services |
| Tickets/projects | Minimal projects | Trace is stronger | Include scoped read/write actions after MVP |
| Message queue and steering | Limited | Trace is stronger | Expose existing session queue actions |
| Persistent schedules | Yes | No | Add event-backed scheduler after delegation MVP |
| Heartbeats into one session | Yes | No | Add separately from schedules |
| Bounded worker/verifier loops | Yes | Planned orchestration only | Add bounded execution primitive aligned with ProjectRun |
| JSON-schema structured output | CLI | No generic CLI mode | Add to foreground `trace session run` later |
| Normalized permissions | Yes | No | Extend adapters and persist permission requests |
| Provider runtime discovery | Yes | Partial/static | Expand adapter capabilities incrementally |
| Custom ACP providers | Yes | No | Later adapter/catalog initiative |
| In-app browser host | Yes | No | Extend Trace browser runtime later |
| Cloud browser proof | No equivalent emphasis | Yes | Preserve Trace's existing approach |
| Voice/dictation | Yes | No | Separate product phase |
| Cross-device operation | Yes | Yes | Reuse Trace server, apps, and subscriptions |
| E2E local relay | Yes | No | Do not port unless local-only deployment requires it |
| Organization/team permissions | Basic local password | Trace is stronger | Preserve Trace authorization on every action |
| Event audit log | File timeline | Trace is stronger | All mutations continue to emit service-layer events |
| Agent attribution | Agent ID | Partial special-user model | Attribute control calls to the calling session |
| Orchestration skills | Yes | No equivalent set | Ship alongside each stable action bundle |

## Trace-native mapping

| Paseo concept | Trace concept | Important difference |
| --- | --- | --- |
| daemon | server + SessionRouter + runtime bridge | Trace is multi-tenant and server-authoritative |
| agent | Session | Trace also separates session status and group/workspace |
| workspace | SessionGroup | This is the workdir/worktree and multi-session unit |
| project registry entry | Repo, partly Project | Trace Project is a product/planning entity, not a checkout container |
| agent timeline | session-scoped Events | Trace events are already durable and broadcast |
| agent provider client | CodingToolAdapter | Trace's interface needs richer capability discovery |
| workspace script | setup script/application process | Trace already distinguishes setup from managed apps |
| relay | central Trace connectivity | Different trust and deployment model |
| parent label | new SessionRelation | Trace should make the link explicit and durable |
| foreground turn | new SessionTurn | Required for cancel/wait/notify correctness |
| schedule | new AutomationSchedule | Must create sessions through services |
| loop | ProjectRun/TicketExecution-aligned loop | Avoid a second orchestration system |

## Proposed control-plane architecture

### 1. ControlActionCatalog

Add a server-owned catalog, for example under `apps/server/src/control/`. Each action definition
contains:

- stable namespaced name
- description written for both humans and models
- runtime input validation
- structured result validation
- required capability
- allowed caller types
- optional workspace/session scoping policy
- handler receiving `ControlContext` and `AbortSignal`

Conceptually:

```ts
type ControlContext = {
  organizationId: string;
  actor: { type: "user"; userId: string } | { type: "agent"; sessionId: string; userId: string };
  callerSessionId: string | null;
  callerSessionGroupId: string | null;
  runtimeInstanceId: string | null;
  capabilities: ReadonlySet<ControlCapability>;
  clientSource: "mcp" | "cli" | "native";
};
```

The catalog is orchestration glue, not a new business-logic layer. A handler may resolve defaults and
compose service calls, but authorization, state transitions, persistence, and event creation remain
in the service layer.

Mutation actions return a compact receipt or immediately useful identifier. They never update client
state directly; UI state still arrives through events. Read and wait actions may return bounded
snapshots.

Action contracts may define command-specific schemas, but must import GraphQL-generated enums and
entity types rather than redefining domain types.

### 2. MCP adapter

Add stateless Streamable HTTP at a versioned endpoint such as `/mcp/control`:

- POST only for the first release
- fresh transport per request
- no in-memory MCP session ownership
- bearer authentication before tool discovery or invocation
- request cancellation forwarded to the action handler
- structured content returned for every tool
- tool list filtered by the caller's capabilities
- conservative response-size limits and transcript curation

Do not expose a generic `execute_graphql` or `send_bridge_command` tool. Those bypass the curated
capability boundary and make model behavior, authorization, and compatibility much harder to audit.

### 3. CLI adapter

The CLI should invoke the same MCP/action surface for mutations so behavior cannot drift. A small
control client can additionally use existing GraphQL subscriptions and terminal WebSockets for
streaming logs or attach mode.

Recommended conventions:

- `trace session ...`, with top-level aliases only for the most common commands
- `--json`, `--yaml`, `--quiet`
- stable error codes and nonzero exit status
- `--server` or named profile for remote targeting
- `trace auth login/status/logout` for humans
- automatic caller/session context from environment inside a Trace runtime
- background by default when called from an agent; foreground by default for a human shell
- no prompt parsing to infer identifiers when an exact ID can be supplied

The existing `trace artifact push` command remains compatible and becomes one command family in the
expanded CLI.

### 4. Provider-native adapter

Native tools are an optimization after MCP works across the existing providers. Extend the coding
tool adapter launch contract with a provider capability such as:

```ts
type CodingToolCapabilities = {
  supportsMcpServers: boolean;
  supportsNativeTraceActions: boolean;
  supportsPermissionRequests: boolean;
  supportsRuntimeCatalog: boolean;
};
```

An adapter must receive either native actions or the internal Trace MCP server, never both. Runtime
injection must remain ephemeral and must not modify user or repository MCP configuration.

### 5. CLI-first fallback

Provider-specific MCP injection can take time. Every current coding tool can already execute shell
commands, so the first release can expose `TRACE_CLI`, `TRACE_CONTROL_URL`,
`TRACE_CONTROL_TOKEN`, `TRACE_SESSION_ID`, and `TRACE_SESSION_GROUP_ID`. A short orchestration skill
can teach the model to call the CLI. MCP can then be enabled adapter by adapter without blocking the
core service work.

This also matches Trace's existing choice to use Playwright CLI rather than requiring browser MCP in
every adapter.

## Identity, authorization, and tokens

This is the highest-risk part of the port.

### Current limitation

Trace events support `actorType: agent`, but agent actor IDs are currently resolved as User rows.
`assertActorOrgAccess` also checks `OrgMember` for both humans and agents. There is no durable
session-agent principal. The old organization-wide `AgentIdentity` system was removed.

The current invocation token is not suitable for control access:

- it only grants `artifact:write`
- it is bound to one invocation
- it is valid for six hours
- it is cleared through `activeInvocationId`
- a long-lived provider MCP configuration cannot safely refresh its static bearer header each turn

### Recommended agent principal

Use the calling `Session` as the concrete agent principal instead of reviving one ambient
organization-wide AI identity.

- Events produced by a control call use `actorType: agent` and `actorId: callerSessionId`.
- Actor resolution first looks for a session and renders its tool/name; historical agent IDs can
  fall back to User lookup for compatibility.
- Authorization resolves the session's organization, creator/grantor, group, visibility, runtime,
  and control grant.
- Service methods gradually accept an actor context instead of assuming every caller is a raw
  `userId`.

This gives the audit log an answer to “which running agent did this?” without introducing a magical
global Trace AI user.

### Recommended control grant

Use a revocable opaque session grant rather than overloading the per-turn artifact JWT. A
`SessionControlGrant` can store:

- grant ID and hashed random secret
- session and organization IDs
- granting user ID
- optional home runtime instance ID
- capability list
- expiry and revocation timestamps
- created/last-used timestamps

The raw token is injected only into the runtime. Rotate it when a provider process is created or
resumed. Revoke it when the session is deleted, archived, fully unloaded, moved to another runtime,
or its access is withdrawn.

Default agent capabilities should be narrow:

- read the caller's visible project/session/group context
- create a child in the same group or an explicitly allowed new group
- send, inspect, wait for, and cancel sessions the caller created or was granted
- read bounded activity
- no organization administration, credential management, billing, raw runtime control, arbitrary
  filesystem root, or permission escalation

Child grants must be an equal or smaller subset of the parent's grant. Tool discovery should omit
actions the caller cannot invoke.

Human CLI authentication should use user-scoped personal tokens or a browser/device login, not an
agent control token.

### Paseo security choices not to copy

Paseo's local single-user trust model is not sufficient for Trace:

- its injected capability is shared for the daemon run rather than bound to one agent
- `callerAgentId` is selected through a query parameter
- the MCP endpoint is open when no daemon password is configured
- a persistent Electron browser profile shares authentication across workspaces

Trace must cryptographically bind the caller session and capabilities to the grant and re-run normal
service authorization on every action.

## Durable delegation and turn state

### SessionRelation

Add an explicit link rather than a containment hierarchy:

```text
SessionRelation
  organizationId
  sourceSessionId
  targetSessionId
  relationType = delegated_by
  createdBy actor
  detachedAt
```

The relation supports UI grouping, ownership checks for completion subscriptions, detaching, and
optional cascade policy. It does not change the fact that both sessions are peer org-scoped
entities.

Default placement for `session.create_child`:

- reuse the caller's SessionGroup
- inherit repo, hosting mode, runtime, branch/workdir, and visibility from the group
- allow another existing group only when the caller can access it
- create a new group/worktree only with an explicit placement and capability
- inherit provider configuration only through normalized, allowlisted settings

### SessionTurn

Add a durable per-prompt execution record or evolve the existing invocation concept into one:

```text
SessionTurn
  id
  organizationId
  sessionId
  status = queued | running | needs_input | completed | failed | cancelled
  promptedBy actor
  promptEventId
  startedAt
  completedAt
  failureCode
```

This lets Trace distinguish:

- a live/resumable session from a currently running turn
- cancelling the current turn from terminating the session
- waiting for a specific prompt from waiting for any future idle transition
- a finish notification for an old turn from a newer overlapping turn

The bridge already keeps adapters on terminate/pause so their native resume IDs survive. A new
`cancel_turn` service can abort the active adapter without setting the session's durable
`agentStatus` to stopped, then append `session_turn_cancelled`.

### CompletionSubscription

Persist one-shot notification intent:

```text
CompletionSubscription
  callerSessionId
  targetSessionId
  targetTurnId
  notifyOn = completed | failed | needs_input
  status = pending | delivering | delivered | cancelled
  deliveredEventId
```

A service reacts to turn/permission events, atomically claims pending subscriptions, and queues a
system-origin message into the caller session. Delivery can resume safely after server restart and
must be idempotent.

The notification should include bounded structured content: target session/turn IDs, title, outcome,
last assistant summary, and a link or activity cursor. It should not inject an unbounded child
transcript.

## Recommended initial action catalog

Use namespaced internal names and simple snake_case MCP names. The exact public naming can be fixed
before implementation; stability matters more than matching Paseo.

### Release 1: self-orchestration loop

| MCP tool | Service behavior |
| --- | --- |
| `create_session` | Start a child or top-level session with explicit placement policy |
| `send_session_prompt` | Send/queue a prompt and return its turn ID |
| `get_session` | Return bounded session, group, runtime, and active-turn state |
| `list_sessions` | Filter visible sessions; default to caller group/children |
| `get_session_activity` | Curated recent timeline entries with cursor |
| `wait_for_session` | Wait up to about 25–30 seconds for a target turn transition |
| `cancel_session_turn` | Abort only the active turn and emit its event |
| `stop_session` | Fully stop/unload a session when explicitly requested |
| `archive_session_group` | Archive through the existing service |
| `update_session` | Change safe title/model/reasoning settings |
| `detach_session` | Remove a delegation relation without stopping either session |

Release 1 success means a Trace coding agent can delegate a task to another Trace session in the
same worktree, continue its own work, receive an event-backed completion message, inspect the child,
and cancel a bad turn without destroying the conversation.

### Release 2: collaboration and work queues

- session message queue/list/reorder/steer
- project get/list and safe update
- ticket get/list/create/update/comment/link
- channel/chat get/list/post/read/wait
- session fork from an event/checkpoint
- provider/tool/model discovery

These mostly adapt existing services, but user-only service signatures must be normalized first.

### Release 3: workspace automation

- terminal list/create/capture/send-keys/kill
- setup script list/run/status
- application list/start/stop/status
- endpoint list
- guarded file read/write
- Git status/diff/checkpoint/commit/branch operations

Every operation must stay pinned to the authorized SessionGroup runtime. Control actions must never
forward caller-supplied bridge messages verbatim.

### Release 4: automation

- schedule create/list/inspect/update/pause/resume/run-once/logs/delete
- heartbeat create/update/delete
- bounded loop run/list/inspect/logs/stop
- structured-output foreground run
- orchestration skills for handoff, advisor, committee, and verifier loops

### Release 5: advanced provider and interaction features

- persisted normalized permission requests
- provider runtime catalog and custom providers
- provider-native subagent discovery
- external session import/history
- shared visible browser host if still desired
- voice and dictation if product-prioritized

## CLI shape

A staged command tree could be:

```text
trace auth login|status|logout
trace session create|list|get|send|activity|wait|cancel-turn|stop|archive|update|detach
trace project list|get|update
trace ticket list|get|create|update|comment
trace terminal list|create|capture|send-keys|kill
trace app list|start|stop
trace schedule create|list|get|update|pause|resume|run-once|logs|delete
trace heartbeat create|update|delete
trace loop run|list|get|logs|stop
trace artifact push
```

Inside a session, this should work without IDs for the common case:

```sh
trace session create --same-workspace --background "review the auth changes"
trace session send <child-id> "also run the integration tests"
trace session wait <child-id> --turn <turn-id> --json
```

Outside a session, organization/server/profile selection must be explicit or come from a saved human
profile. Machine output must never mix progress text into stdout; diagnostics belong on stderr.

## Relationship to Project Orchestration

`SESSION_AUTOPILOT_PLAN.md` and this control plane solve different layers:

- the control plane is the general, reusable way humans and agents invoke Trace actions
- ProjectRun is durable product orchestration for planning and executing a ticket DAG
- project controllers and ticket workers should consume the same control catalog
- schedules and loops can trigger ProjectRun or Session actions but do not replace ProjectRun state

The RFC already proposes scoped service-backed runtime actions. `ControlActionCatalog` should become
the concrete implementation of that concept.

One current RFC statement is stale: it says agents already have basic `project.create`,
`project.linkEntity`, and `project.get` actions. Those action implementations are not present in the
current repository. The future RFC update should distinguish existing services/GraphQL mutations
from not-yet-built runtime actions.

## Phased implementation plan

### Phase 0: contracts, identity, and service audit

Deliverables:

- define `ControlContext`, capability names, error envelope, result envelope, and action metadata
- audit candidate service methods for `userId` assumptions
- make actor-aware authorization consistent for the first action set
- resolve agent actors from calling sessions while retaining historical fallback
- add revocable `SessionControlGrant`
- document invariants and threat model

Verification:

- an agent grant cannot cross organization, private-group, runtime, or workspace boundaries
- revocation takes effect on the next request
- a child cannot mint capabilities its parent lacks
- every successful mutation event names the calling session as actor
- human and agent callers reach the same service behavior

### Phase 1: action catalog and read-only MCP

Deliverables:

- catalog framework with schema validation and filtered discovery
- read-only session/group/provider/activity actions
- stateless authenticated MCP route
- direct catalog tests plus MCP parity tests
- response size and timeline curation limits

Verification:

- direct and MCP execution produce identical structured results
- unknown fields, invalid enums, and unauthorized IDs fail closed
- MCP cancellation reaches action handlers
- no route handler reads Prisma or creates events directly

### Phase 2: session mutation and CLI MVP

Deliverables:

- create/send/update/stop/archive mutations
- expanded `trace` CLI with auth, profiles, JSON/YAML/quiet output
- runtime environment for CLI agent context
- first orchestration skill using CLI
- mutation events contain full entity snapshots needed by clients

Verification:

- human CLI and in-session CLI both create and message sessions
- same-group placement uses the existing workdir and runtime
- explicit new-group placement creates a safe isolated worktree
- desktop and cloud runtimes behave the same through SessionRouter
- existing artifact upload remains compatible

### Phase 3: turn state and durable delegation

Deliverables:

- `SessionTurn`, `SessionRelation`, and `CompletionSubscription`
- current-turn cancel path through server, router, and bridges
- background defaults for agent callers
- short event-backed wait and curated activity
- durable completion/permission notification into the caller
- child-session track in web/mobile UI

Verification:

- cancel ends one turn but a later prompt resumes the same provider session
- two overlapping or sequential turns cannot satisfy the wrong wait/subscription
- server restart does not lose a pending completion notification
- repeated delivery is idempotent
- detach changes relationship only
- archive cascade follows explicit policy and does not delete peer data accidentally

### Phase 4: adapter-level MCP injection

Deliverables:

- ephemeral MCP launch configuration for each supported coding tool
- capability reporting in `CodingToolAdapter`
- grant injection and lifecycle rotation/revocation
- suppression of duplicate internal tools
- CLI remains the fallback

Verification:

- no user/project MCP config file is mutated
- persisted tool session state contains no bearer token
- resumed provider sessions receive a valid current grant
- tools disappear immediately after revocation
- every adapter passes an end-to-end create/send/wait test

### Phase 5: collaboration and workspace actions

Deliverables:

- project/ticket/channel/chat actions
- queue and steering actions
- terminal capture/input services
- setup/application process actions
- guarded file and managed Git actions

Verification:

- service-layer events remain the only mutation source
- terminal and file operations are pinned to the authorized runtime
- private group/project/channel visibility is enforced for agent callers
- no action can address arbitrary host paths

### Phase 6: schedules, heartbeats, and loops

Deliverables:

- durable schedule and heartbeat models/services/events
- leased/idempotent scheduler suitable for multiple server replicas
- fresh-session schedule runs and same-session heartbeat runs
- bounded worker/verifier loop aligned with ProjectRun where applicable
- UI/CLI/MCP inspection and control

Verification:

- duplicate server replicas cannot fire the same occurrence twice
- restarts recover or explicitly reconcile in-flight work
- max runs, expiry, cancellation, and time zones are deterministic
- loops always have iteration/time limits and auditable verification output

### Phase 7: provider permissions and advanced surfaces

Deliverables:

- persisted normalized permission model and adapter mappings
- provider discovery/mode/feature capability expansion
- optional provider-native tool adapter
- later browser/voice/import work based on product priority

Verification:

- unsupported providers fail closed
- unattended runs cannot broaden approval policy
- permission responses target an exact pending request and option
- browser/file context never crosses workspace or human consent boundaries

## Expected repository changes

Exact names can change during implementation, but ownership should remain close to:

| Area | Expected change |
| --- | --- |
| `apps/server/src/control/` | catalog, context, capabilities, action modules, serialization |
| `apps/server/src/routes/` or bootstrap | authenticated stateless MCP endpoint |
| `apps/server/src/services/` | actor-aware signatures, turn/delegation/grant services |
| `apps/server/prisma/schema.prisma` | grants, turns, relations, completion subscriptions; later automation |
| `packages/gql/src/schema.graphql` | new durable entities/events and human UI operations |
| `packages/shared/src/adapters/` | launch capabilities and ephemeral MCP/native tool config |
| `apps/desktop/src/bridge.ts` | invocation environment and cancel-turn semantics |
| `apps/container-bridge/src/bridge.ts` | same cloud runtime behavior |
| `runtime/bin/trace.mjs` | expanded CLI or a compatibility shim to a CLI package |
| `packages/shared/src/trace-runtime*` | regenerated bundled runtime payload |
| `packages/client-core/` | new entity/event hydration for durable models |
| `apps/web/`, `apps/mobile/` | delegation track, grants/automation/permission UI as phases land |
| `.claude/skills/` and Codex mirror | Trace orchestration skills, kept in sync |

Prefer small action modules grouped by domain over a single Paseo-style multi-thousand-line catalog
file. The registry can compose them while preserving one component/responsibility per file.

## What not to port

- Do not add a second local daemon beside Trace's server and bridge.
- Do not let MCP or CLI talk directly to Prisma, EventService, or bridge commands.
- Do not use one daemon-wide bearer token or caller-controlled session query parameter.
- Do not expose the raw GraphQL schema as a model tool.
- Do not make `Project` mean checkout/workspace; use SessionGroup.
- Do not persist internal MCP URLs or bearer tokens in provider/user config.
- Do not depend on in-memory finish subscriptions for durable orchestration.
- Do not implement schedules with process-local timers only; Trace is multi-replica.
- Do not create a generic autonomous loop that competes with ProjectRun orchestration.
- Do not copy AGPL source into Trace without an explicit licensing decision.
- Do not block the control-plane MVP on browser, voice, E2E relay, or custom-provider breadth.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Agent becomes an authorization bypass | Session-bound revocable grants, filtered discovery, service checks on every call |
| CLI/MCP/app behavior drifts | One action catalog for model/CLI mutations; service layer remains canonical |
| Action schemas duplicate GraphQL types | Import generated domain types/enums; keep schemas command-specific |
| Parent notifications race or duplicate | Persist target turn and atomically claim idempotent delivery |
| Tool output bloats model context | Curated activity, pagination/cursors, byte and item limits |
| Long-lived MCP token becomes stale | Opaque revocable grant rotated on provider lifecycle |
| Cross-runtime file/terminal access | Pin all calls to authorized group runtime and use existing runtime-access service |
| Server replicas duplicate automation | DB leases, unique occurrence keys, idempotent event/service operations |
| Too many tools hurt model behavior | Capability-filtered bundles and workflow-specific skills |
| Existing services assume human callers | Phase 0 audit and actor-context migration before mutation exposure |
| AGPL contamination | Clean-room implementation and licensing review before any direct reuse |

## First vertical slice

The smallest slice that proves the thesis is:

1. Add session-bound control grants and caller-session attribution.
2. Add the catalog with `get_session`, `list_sessions`, and `get_session_activity`.
3. Add stateless authenticated MCP plus a CLI client.
4. Add `create_session` and `send_session_prompt`, defaulting agent callers to the same SessionGroup
   and background execution.
5. Add durable turn records, `wait_for_session`, and `cancel_session_turn`.
6. Add a durable parent relation and completion subscription.
7. Ship one orchestration skill and one end-to-end test where a parent delegates, continues, receives
   completion, inspects the child, and sends a follow-up.

Defer schedules, terminals, Git, browser, voice, and custom providers until that loop is reliable.

## Definition of done for the control-plane MVP

- A human can install/authenticate the CLI and receive stable machine-readable output.
- An active Trace coding session automatically knows its own control context.
- The session can create a child in the same SessionGroup without knowing internal workdir/runtime
  details.
- The child is a normal Trace session visible to every authorized client.
- The parent can continue working while the child runs.
- Completion or permission need reaches the parent once, even across a server restart.
- The parent can inspect bounded child activity and send a follow-up.
- Cancelling a child turn preserves its resumable conversation.
- Every mutation goes through a service and emits an attributable event.
- No capability crosses organization, visibility, workspace, runtime, or grant boundaries.
- CLI, MCP, and direct catalog conformance tests pass for the supported action set.

At that point Trace will have the essential property that makes Paseo compelling—AI can operate the
product it is running inside—while retaining Trace's stronger event model, collaboration model, and
local/cloud runtime abstraction.
