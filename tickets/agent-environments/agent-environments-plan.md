# Agent Environments

## Goal

Trace should support org-configured agent runtimes instead of hardcoding a single cloud backend.

An org should be able to run agent sessions through:

- a connected local desktop bridge
- a generic provisioned runtime started by an org-owned launcher
- a reference launcher for AWS, Fly, Kubernetes, or any other platform

The product-level model should be:

```txt
Session asks for an Agent Environment
-> the environment selects a runtime adapter
-> the adapter starts or selects compute
-> the runtime bridge carries live agent traffic
-> service-layer events remain the source of truth
```

Trace should not treat "cloud" as synonymous with Fly. Fly is one possible
launcher implementation behind the generic provisioned runtime contract.

More specifically, Trace should not treat Fly as a core adapter at all in the first version.
Trace core should only know about local runtimes and provisioned runtimes. Fly can be
implemented as a launcher that satisfies the generic provisioned runtime contract.

## Current Baseline

The repo already has several pieces of this architecture:

- `packages/shared/src/bridge.ts` defines a shared bridge protocol.
- `BridgeRuntimeHello.hostingMode` already supports `"cloud" | "local"`.
- `apps/desktop/src/bridge.ts` connects as a local bridge and sends `runtime_hello`.
- `apps/server/src/lib/session-router.ts` already has a `SessionAdapter` interface.
- `apps/server/src/lib/session-router.ts` already has local and cloud adapter branches.
- Current cloud behavior is still Fly/cloud-machine specific.

This work should formalize the existing shape into org-configured environments.

## Concepts

### Agent Environment

An `AgentEnvironment` is an org-scoped runtime configuration.

Examples:

- `My MacBook`
- `Company AWS VPC`
- `Team Fly Launcher`
- `Private Kubernetes`

Each environment chooses an adapter type and stores adapter-specific configuration.

```txt
AgentEnvironment
  id
  orgId
  name
  adapterType
  config
  enabled
  isDefault
  createdAt
  updatedAt
```

Initial adapter types:

- `local`
- `provisioned`

Provisioned environments should use an authenticated lifecycle endpoint. The endpoint can start
compute in AWS ECS, Fly, Kubernetes, Nomad, EC2, or any other system.

Environments should declare minimal compatibility constraints in config for V1:

- supported tools
- startup timeout

Advanced admission policies can be added after V1 if needed:

- optional allowed repo IDs
- max concurrent sessions
- max session duration
- per-environment quotas

Future work can add optional reference launchers, but they should live outside Trace core:

- `examples/launchers/aws-ecs`
- `examples/launchers/fly`
- `examples/launchers/kubernetes`

### Runtime Adapter

A runtime adapter owns lifecycle for infrastructure.

It answers:

- How do we start or select the runtime?
- How do we stop it?
- How do we inspect status?
- How do we validate configuration?

It does not own user message handling. Message handling stays in the service layer and runtime bridge.

### Runtime Bridge

The runtime bridge is the live WebSocket connection between a running agent host and Trace.

It carries:

- `prepare`
- `run`
- `send`
- `pause`
- `resume`
- `terminate`
- `delete`
- terminal commands
- file/read/diff commands
- runtime heartbeats
- session output
- workspace ready/failed events

Local and cloud runtimes should both use the same bridge protocol once connected.

### Terminal Multiplexing

The environment refactor must preserve multiple terminal sessions per Trace session/runtime.

Requirements:

- A Trace session/runtime can have zero, one, or many active terminal sessions.
- Every terminal command and runtime terminal event must carry a `terminalId`.
- Terminal lifecycle is owned by the runtime bridge path, not the lifecycle adapter.
- Runtime adapters must not assume a single shell, terminal, or PTY per session.
- Terminal input, output, resize, ready, exit, error, and destroy flows must remain isolated by `terminalId`.
- Session cleanup must destroy all active terminals for the session/runtime.
- Provisioned runtimes must support the same terminal multiplexing behavior as local desktop runtimes once their bridge is connected.

## Target Architecture

```txt
Web / Desktop
  -> GraphQL
    -> SessionService
      -> AgentEnvironmentService
        -> SessionRouter
          -> RuntimeAdapterRegistry
            -> LocalRuntimeAdapter
            -> ProvisionedRuntimeAdapter
          -> RuntimeBridge
            -> local desktop bridge
            -> cloud container bridge
```

Adapters handle lifecycle. Bridges handle live command traffic.

## Data Model

### Prisma

Add an org-scoped model:

```prisma
model AgentEnvironment {
  id          String   @id @default(cuid())
  orgId       String
  name        String
  adapterType String
  config      Json
  enabled     Boolean  @default(true)
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@index([orgId, adapterType])
}
```

Only one enabled default environment should exist per org. If Prisma cannot express the exact partial unique constraint portably, enforce it transactionally in `AgentEnvironmentService`.

### Session Runtime State

The existing session `connection` JSON currently stores runtime details such as `runtimeInstanceId`, runtime label, cloud machine ID, retry state, and move/retry flags.

For the first implementation, we can continue using `connection` but should normalize the shape:

```ts
type SessionConnection = {
  state: "pending" | "connected" | "disconnected" | "failed" | "stopping" | "stopped";
  environmentId?: string;
  adapterType?: "local" | "provisioned";
  runtimeInstanceId?: string;
  runtimeLabel?: string;
  providerRuntimeId?: string;
  providerRuntimeUrl?: string;
  retryCount: number;
  canRetry: boolean;
  canMove: boolean;
  statusReason?: string;
  requestedAt?: string;
  provisioningStartedAt?: string;
  connectedAt?: string;
  stoppedAt?: string;
  failedAt?: string;
};
```

Longer term, move runtime state into a dedicated `SessionRuntime` table:

```prisma
model SessionRuntime {
  id                String   @id @default(cuid())
  sessionId         String
  environmentId     String
  adapterType       String
  runtimeInstanceId String?
  providerRuntimeId String?
  status            String
  statusReason      String?
  requestedAt       DateTime @default(now())
  provisioningAt    DateTime?
  bootingAt         DateTime?
  connectedAt       DateTime?
  stoppingAt        DateTime?
  stoppedAt         DateTime?
  failedAt          DateTime?
  lastHeartbeatAt   DateTime?
  metadata          Json?
}
```

Do not block the initial feature on this table unless `connection` becomes too hard to maintain safely.

## GraphQL Schema

Add schema types in `packages/gql/src/schema.graphql`.

```graphql
enum AgentEnvironmentAdapterType {
  local
  provisioned
}

type AgentEnvironment {
  id: ID!
  orgId: ID!
  name: String!
  adapterType: AgentEnvironmentAdapterType!
  config: JSON!
  enabled: Boolean!
  isDefault: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AgentEnvironmentTestResult {
  ok: Boolean!
  message: String
}

input CreateAgentEnvironmentInput {
  orgId: ID!
  name: String!
  adapterType: AgentEnvironmentAdapterType!
  config: JSON!
  enabled: Boolean
  isDefault: Boolean
}

input UpdateAgentEnvironmentInput {
  id: ID!
  name: String
  config: JSON
  enabled: Boolean
  isDefault: Boolean
}
```

Add queries and mutations:

```graphql
type Query {
  agentEnvironments(orgId: ID!): [AgentEnvironment!]!
}

type Mutation {
  createAgentEnvironment(input: CreateAgentEnvironmentInput!): AgentEnvironment!
  updateAgentEnvironment(input: UpdateAgentEnvironmentInput!): AgentEnvironment!
  deleteAgentEnvironment(id: ID!): Boolean!
  testAgentEnvironment(id: ID!): AgentEnvironmentTestResult!
}
```

Update session creation input to accept an environment:

```graphql
input CreateSessionInput {
  environmentId: ID
}
```

If the existing input already has `hosting` and `runtimeInstanceId`, keep them temporarily for compatibility, but new code should prefer `environmentId`.

Run:

```bash
pnpm gql:codegen
```

## Service Layer

### AgentEnvironmentService

Add `apps/server/src/services/agent-environment.ts`.

Responsibilities:

- create environment
- update environment
- delete or disable environment
- list environments for an org
- resolve default environment
- resolve environment for a session request
- validate adapter-specific config
- enforce org authorization
- enforce one default per org
- emit service-layer events

Expected methods:

```ts
create(input, actor)
update(input, actor)
delete(id, actor)
listForOrg(orgId, actor)
getForSession(input, actor)
setDefault(id, actor)
test(id, actor)
```

Resolvers must stay thin:

```txt
resolver
-> parse input
-> call AgentEnvironmentService
-> return result
```

### SessionService

Update session creation to resolve an environment before provisioning:

```txt
if input.environmentId exists:
  load and authorize that environment
else:
  load org default environment
else:
  fall back to compatibility hosting behavior
```

Session creation should then pass environment details to `SessionRouter.createRuntime`.
Before provisioning, `SessionService` should also check V1 compatibility constraints such as enabled state and supported tool.

Compatibility rule:

- existing `hosting: "local" | "cloud"` should keep working during migration
- new UI and API should use `environmentId`
- `hosting` should eventually become derived from environment adapter type or removed

## Runtime Adapter Interface

Replace the current hosting-only adapter selection with an environment-aware adapter registry.

```ts
type RuntimeAdapterType = "local" | "provisioned";

interface RuntimeAdapter {
  type: RuntimeAdapterType;

  validateConfig(config: Record<string, unknown>): Promise<void>;

  testConfig(input: {
    organizationId: string;
    config: Record<string, unknown>;
  }): Promise<{ ok: boolean; message?: string }>;

  startSession(input: RuntimeStartInput): Promise<RuntimeStartResult>;

  stopSession(input: RuntimeStopInput): Promise<RuntimeStopResult>;

  getStatus(input: RuntimeStatusInput): Promise<RuntimeStatusResult>;
}
```

The adapter interface starts/selects compute only. It must not expose a single terminal endpoint or terminal stream; terminal creation and I/O continue to flow through bridge commands keyed by `terminalId`.

Inputs:

```ts
type RuntimeStartInput = {
  sessionId: string;
  organizationId: string;
  actorId: string;
  environment: AgentEnvironment;
  tool: string;
  model?: string;
  repo?: {
    id: string;
    name: string;
    remoteUrl: string;
    defaultBranch: string;
  } | null;
  branch?: string;
  checkpointSha?: string;
  runtimeToken: string;
  bridgeUrl: string;
};

type RuntimeStartResult = {
  runtimeInstanceId?: string;
  runtimeLabel?: string;
  providerRuntimeId?: string;
  status: "selected" | "provisioning" | "booting" | "connecting" | "connected";
  metadata?: Record<string, unknown>;
};
```

Stop and status inputs must also carry enough environment context for the adapter to resolve
adapter config and launcher auth without bypassing the registry contract. For provisioned
runtimes, that means `environment` or an equivalent validated environment/config reference plus
the persisted provider runtime ID.
<!-- Updated after ticket 04 review/fix: stopSession/getStatus inputs now carry environment
context so ticket 06 can call stopUrl/statusUrl with auth through the adapter contract. -->

The existing `SessionAdapter` can be evolved in place or replaced with this interface.

## Adapter Registry

Add a registry:

```ts
class RuntimeAdapterRegistry {
  constructor(private adapters: RuntimeAdapter[]) {}

  get(type: RuntimeAdapterType): RuntimeAdapter {
    const adapter = this.adapters.find((candidate) => candidate.type === type);
    if (!adapter) throw new Error(`Unsupported runtime adapter: ${type}`);
    return adapter;
  }
}
```

`SessionRouter` should depend on the registry instead of branching directly on `"cloud"`.

## Local Adapter

### Purpose

Local uses an already-connected desktop bridge. It does not provision compute.

### Environment Config

Minimal config:

```json
{
  "runtimeInstanceId": "desktop-runtime-id"
}
```

For a default local environment, the runtime can also be selected dynamically from accessible local runtimes.

### Start Flow

```txt
Trace Desktop connects to /bridge
-> sends runtime_hello hostingMode=local
-> server registers runtime
-> user starts session with local environment
-> LocalRuntimeAdapter selects bridge
-> SessionRouter sends prepare
-> desktop creates worktree
-> desktop sends workspace_ready
-> SessionService sends run/send when user prompt is delivered
```

### Stop Flow

```txt
User stops/deletes session
-> LocalRuntimeAdapter sends terminate/delete over bridge
-> desktop stops tool process
-> desktop removes Trace-created worktree when requested
-> desktop bridge remains connected
```

Local never deprovisions the user's computer.

## Provisioned Adapter

### Purpose

Provisioned lets an org run agents in any infrastructure, including AWS inside a VPC,
Fly, Kubernetes, Nomad, EC2, or an internal platform, without Trace having
cloud-provider-specific code.

Trace core only calls an authenticated lifecycle endpoint. The endpoint is the launcher.
The launcher owns provider-specific work such as `ecs.runTask`, Fly machine creation,
Kubernetes Job creation, or any internal compute API.

### Environment Config

```json
{
  "startUrl": "https://infra.company.com/trace/start-session",
  "stopUrl": "https://infra.company.com/trace/stop-session",
  "statusUrl": "https://infra.company.com/trace/session-status",
  "auth": {
    "type": "bearer",
    "secretId": "secret_456"
  },
  "capabilities": {
    "supportedTools": ["claude_code", "codex"]
  },
  "startupTimeoutSeconds": 180,
  "deprovisionPolicy": "on_session_end",
  "launcherMetadata": {
    "provider": "aws-ecs",
    "environment": "prod-vpc"
  }
}
```

Secrets must be referenced by ID, not stored directly in config.

### Start Request

Trace sends:

```json
{
  "sessionId": "sess_123",
  "orgId": "org_123",
  "runtimeToken": "short_lived_runtime_token",
  "bridgeUrl": "wss://trace.example.com/bridge",
  "repo": {
    "id": "repo_123",
    "name": "app",
    "remoteUrl": "https://github.com/company/app",
    "defaultBranch": "main",
    "branch": "feature"
  },
  "tool": "claude_code",
  "model": "claude-opus-4",
  "metadata": {
    "requestedBy": "user_123"
  }
}
```

Expected response:

```json
{
  "runtimeId": "arn:aws:ecs:us-east-1:123456789:task/cluster/abc",
  "status": "provisioning",
  "label": "AWS ECS task abc"
}
```

The provisioned adapter stores:

- `providerRuntimeId`
- `runtimeLabel`
- adapter status

The runtime is ready only when the cloud bridge connects back.

### Stop Request

Trace sends:

```json
{
  "sessionId": "sess_123",
  "runtimeId": "arn:aws:ecs:us-east-1:123456789:task/cluster/abc",
  "reason": "user_stopped"
}
```

Expected response:

```json
{
  "ok": true,
  "status": "stopping"
}
```

### Status Request

Trace calls `statusUrl` with the provider runtime ID.

The customer returns:

```json
{
  "runtimeId": "arn:aws:ecs:us-east-1:123456789:task/cluster/abc",
  "status": "running",
  "message": "ECS task is RUNNING"
}
```

Map provider statuses to Trace statuses:

```txt
provisioning
booting
connecting
connected
stopping
stopped
failed
unknown
```

### Lifecycle Security

Lifecycle requests must be authenticated.

V1 should support bearer-token auth because it is simple for org-owned launchers:

```txt
Authorization: Bearer <launcher-token>
```

The bearer token is stored as an org secret and referenced by `auth.secretId`.
Trace sends it only to the configured launcher endpoints.

Lifecycle requests should also carry a stable idempotency key:

```txt
Trace-Request-Id: req_123
Trace-Idempotency-Key: session:sess_123:start
```

Launchers should treat duplicate start/stop calls with the same idempotency key as the same operation. This keeps retries from creating duplicate compute or failing already-stopped runtimes.

Bearer-token requirements:

- HTTPS only
- long random token
- encrypted secret storage
- no request or error logging of the token
- constant-time comparison by the launcher
- rotation path through org secret replacement

HMAC request signing can be kept as a stronger optional auth mode for production-sensitive launchers. Use:

- timestamp header
- request ID header
- HMAC signature header
- signing secret from org secret store

Example headers:

```txt
Trace-Timestamp: 2026-04-28T14:00:00.000Z
Trace-Request-Id: req_123
Trace-Signature: v1=<hex-hmac>
```

Signature payload:

```txt
timestamp + "." + requestId + "." + rawBody
```

For HMAC mode, the customer should reject:

- invalid signatures
- old timestamps
- replayed request IDs

Launcher auth is separate from runtime bridge auth. Do not pass the launcher bearer token into the agent container. Provisioned runtimes should still receive only a short-lived runtime token scoped to one session/runtime.

## Runtime Bridge For Cloud

Cloud runtimes should use the same bridge protocol as local runtimes after they start.

The adapter injects:

```txt
TRACE_SESSION_ID
TRACE_ORG_ID
TRACE_RUNTIME_INSTANCE_ID
TRACE_RUNTIME_TOKEN
TRACE_BRIDGE_URL
```

The cloud container starts `trace-agent-runtime`, which connects to the server bridge endpoint and sends:

```json
{
  "type": "runtime_hello",
  "instanceId": "runtime_123",
  "label": "AWS ECS task abc",
  "hostingMode": "cloud",
  "protocolVersion": 1,
  "agentVersion": "0.1.0",
  "supportedTools": ["claude_code", "codex"],
  "registeredRepoIds": []
}
```

Cloud runtimes use an empty `registeredRepoIds` list because they can clone on demand.

After the bridge connects, cloud runtimes must handle multiple concurrent `terminal_create` commands for the same session/runtime and route all terminal traffic by `terminalId`, matching local desktop behavior.

## Runtime Tokens

Cloud bridge authentication needs a short-lived runtime token.

The token should encode:

- `organizationId`
- `sessionId`
- `runtimeInstanceId`
- `environmentId`
- expiration
- allowed bridge scope

The bridge handler should verify:

- token is valid
- token has not expired
- `runtime_hello.instanceId` matches token claims
- `hostingMode` matches expected adapter mode
- protocol version is compatible
- runtime tools satisfy the selected environment/session request

Local bridge auth can continue to use the existing desktop auth flow.

## Startup Lifecycle

Sessions can exist before runtime compute is ready.

Use explicit lifecycle states:

```txt
requested
provisioning
booting
connecting
connected
failed
timed_out
```

Flow:

```txt
User starts session
-> create session event
-> create runtime start requested event
-> adapter.startSession
-> runtime provisioning event
-> provider returns runtime ID
-> wait for bridge
-> cloud bridge sends runtime_hello
-> runtime connected event
-> send queued prepare/run commands
```

Readiness is the bridge connection, not provider status.

Provider status says compute exists. Bridge connection says the actual agent runtime can receive commands.

## Message Delivery During Startup

If the user sends a message before the runtime connects:

- append the user message event immediately
- do not lose the message
- mark delivery as pending runtime
- deliver in event order once the bridge connects

The bridge should be the delivery channel for:

- initial prompt
- follow-up prompts
- cancellation
- pause/resume
- tool session continuation

The provisioned adapter should not receive AI messages.

## Deprovisioning

Deprovisioning belongs to the adapter that provisioned the runtime.

Bridge disconnection is only a signal. It should not be the only cleanup mechanism.

### Local

Local cleanup:

- stop active tool process
- delete Trace-created worktree when requested
- clean terminal/process state
- keep desktop bridge connected

Local does not deprovision the host machine.

### Provisioned

Provisioned cleanup:

- send `terminate` over bridge if connected
- call `stopUrl` with `sessionId` and `providerRuntimeId`
- mark runtime stopping
- poll `statusUrl` until stopped or timeout
- retry stop if needed

### Deprovision Policies

Support environment-level policy:

```json
{
  "deprovisionPolicy": "on_session_end",
  "idleTimeoutSeconds": 600
}
```

Policies:

- `on_session_end`: destroy or stop when the session ends
- `after_idle`: keep warm until no sessions use the runtime for N seconds
- `manual`: keep runtime until explicit admin/user action

Initial recommendation:

- local: `manual`
- provisioned: `on_session_end`
- provisioned with a shared launcher pool: `after_idle`

## Events

Add or normalize events around runtime lifecycle.

Minimum:

```txt
agent_environment.created
agent_environment.updated
agent_environment.deleted
session.runtime_start_requested
session.runtime_provisioning
session.runtime_connecting
session.runtime_connected
session.runtime_start_failed
session.runtime_start_timed_out
session.runtime_stopping
session.runtime_stopped
session.runtime_deprovision_failed
session.runtime_disconnected
session.runtime_reconnected
```

Keep provider details in event payload metadata. Do not create product-level events like `fly_machine_created` or `ecs_task_started`.

## UI

Add org settings:

```txt
Org Settings
-> Agent Environments
```

The page should support:

- list environments
- create environment
- edit environment
- enable/disable
- set default
- test connection
- show last error/status

Initial forms:

### Local

Fields:

- name
- default local runtime selection

The UI should show connected local bridges and registered repos.

### Provisioned

Fields:

- name
- start URL
- stop URL
- status URL
- launcher auth type
- launcher auth secret
- startup timeout
- deprovision policy
- optional launcher metadata for display/debugging

Session creation UI should show:

```txt
Environment
[ Org Default: Company AWS VPC ]
```

Advanced users can choose another enabled environment.

## Secrets

Do not store raw provider tokens in `AgentEnvironment.config`.

If the repo does not already have org secret storage, add the smallest service needed:

```txt
OrgSecret
  id
  orgId
  name
  encryptedValue
  createdAt
  updatedAt
```

Environment config should reference secrets:

```json
{
  "auth": {
    "type": "bearer",
    "secretId": "secret_456"
  }
}
```

The service layer resolves secrets only when invoking adapters. Launcher auth secrets are used only for Trace-to-launcher lifecycle requests. Runtime bridge tokens are created per session and should not be stored as org secrets.

## Migration Plan

### Phase 1: Introduce Environments

- Add Prisma model.
- Add GraphQL schema.
- Add codegen.
- Add `AgentEnvironmentService`.
- Add thin resolvers.
- Add environment events.

### Phase 2: Adapter Registry

- Extract current local adapter into `LocalRuntimeAdapter`.
- Add `ProvisionedRuntimeAdapter` for authenticated lifecycle endpoints.
- Move or remove current Fly/cloud-machine logic so Fly is not a core adapter path.
- Add `RuntimeAdapterRegistry`.
- Update `SessionRouter` to dispatch by environment adapter type.

### Phase 3: Session Creation

- Add `environmentId` to session creation.
- Resolve default environment when omitted.
- Keep existing `hosting` behavior as compatibility fallback.
- Persist environment/runtime metadata in `connection`.

### Phase 4: Provisioned Adapter

- Implement provisioned config validation.
- Implement authenticated start/stop/status calls.
- Implement idempotency keys for start/stop retries.
- Store provider runtime ID.
- Wait for cloud bridge before delivering commands.
- Add timeout behavior.

### Phase 5: Runtime Bridge Hardening

- Add short-lived cloud runtime tokens.
- Validate cloud `runtime_hello` against token claims.
- Validate cloud runtime protocol version and tool compatibility.
- Track heartbeats and stale runtimes.
- Queue undelivered messages while runtime is starting.

### Phase 6: Deprovisioning

- Add explicit stop/deprovision states.
- Implement adapter-owned cleanup.
- Add retryable deprovision failures.
- Add background reconciliation for stuck runtimes.

### Phase 7: UI

- Add org settings environment management.
- Add session environment selector.
- Show startup/deprovision status in session UI.

### Phase 8: Compatibility Cleanup

- Migrate existing Fly/cloud settings to `provisioned` environments, or move Fly support into a reference launcher.
- Migrate existing local runtime selection into `local` environments where useful.
- Deprecate direct `hosting` usage in new code.
- Remove Fly assumptions from `SessionService` and `SessionRouter`.

## Testing

### Unit Tests

Add tests for:

- environment create/update validation
- one default environment per org
- adapter registry lookup
- local adapter bridge selection
- provisioned bearer auth header generation
- optional provisioned signature generation
- lifecycle idempotency behavior
- provisioned status mapping
- environment compatibility constraints
- startup timeout behavior
- deprovision retry behavior

### Service Tests

Add tests for:

- session creation with explicit environment
- session creation with org default environment
- fallback behavior when no environment exists
- local repo availability checks
- cloud startup waiting for bridge
- pending message delivery after bridge connection

### Integration Tests

Add tests for:

- local session using connected desktop runtime
- provisioned start returning provider runtime ID
- cloud bridge connecting after provisioned start
- stop session calling provisioned stop
- failed provisioned start marking runtime failed
- missing bridge connection marking runtime timed out

## Open Decisions

- Whether to add `SessionRuntime` now or keep normalized runtime state in `Session.connection` for v1.
- Whether local environments should be explicit records per bridge or a generic "any accessible local bridge" environment.
- Whether Fly support should be deleted from core immediately or kept temporarily as a compatibility shim while a reference launcher is built.
- Whether provisioned status polling is required in v1 or only used for cleanup/recovery.
- Whether runtime tokens should be JWTs or opaque DB-backed tokens.
- Whether HMAC should be implemented in V1 or deferred behind bearer-token launcher auth.
- Whether advanced admission policies stay in config or become first-class columns later.

## Recommended V1 Scope

Build the smallest version that proves the architecture:

- `AgentEnvironment` model and service
- local and provisioned adapter types
- `environmentId` on session creation
- default environment per org
- provisioned start/stop/status with authenticated requests
- lifecycle idempotency for provisioned start/stop retries
- basic environment compatibility checks
- cloud runtime bridge token auth
- startup timeout
- adapter-owned deprovisioning
- basic org settings UI

Do not add AWS-specific or Fly-specific first-party support in Trace core. A company AWS VPC setup should use the provisioned adapter first:

```txt
Trace ProvisionedRuntimeAdapter
-> company launcher service
-> ECS RunTask inside company VPC
-> trace-agent-runtime connects back to Trace bridge
```

That keeps Trace generic while supporting AWS immediately.
