# Trace Reference Launchers

Reference launchers are examples for running Trace provisioned agent runtimes on infrastructure
owned by an organization. They live outside Trace core and satisfy the generic provisioned runtime
lifecycle contract.

Trace core only calls configured lifecycle endpoints:

- `POST /trace/start-session`
- `POST /trace/stop-session`
- `POST /trace/session-status`

The launcher starts or stops compute. The runtime process inside that compute connects back to Trace
through `TRACE_BRIDGE_URL` with `TRACE_RUNTIME_TOKEN`; lifecycle endpoints do not carry agent
messages, terminal streams, or file operations.

## Available References

- [Fly Machines](fly/README.md): executable Express controller that creates and stops Fly Machines.
- [AWS ECS Fargate](aws-ecs/README.md): VPC deployment guide and endpoint mapping for ECS tasks.
- [Kubernetes Job](kubernetes/README.md): cluster deployment guide and endpoint mapping for Jobs.

## Lifecycle Contract

Start requests include session, org, repo, tool, model, runtime token, bridge URL, and bootstrap env
values. Launchers should inject at least these env vars into the runtime container:

```txt
TRACE_SESSION_ID
TRACE_ORG_ID
TRACE_RUNTIME_INSTANCE_ID
TRACE_RUNTIME_TOKEN
TRACE_BRIDGE_URL
```

Stop requests include:

```json
{
  "sessionId": "sess_123",
  "runtimeId": "provider-runtime-id",
  "reason": "session_stopped"
}
```

Status requests include:

```json
{
  "runtimeId": "provider-runtime-id"
}
```

Status responses should use Trace runtime statuses:

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

## Security

Bearer launchers should:

- require HTTPS outside local development
- compare bearer tokens in constant time
- avoid logging bearer tokens, runtime tokens, API tokens, or secret env vars
- rotate tokens by replacing the Trace org secret referenced by the Agent Environment

HMAC launchers should:

- validate `Trace-Timestamp`, `Trace-Request-Id`, and `Trace-Signature`
- reject old timestamps
- reject replayed request IDs
- compute signatures over `timestamp + "." + requestId + "." + rawBody`

## Idempotency

Trace sends stable `Trace-Idempotency-Key` values for start and stop retries. Launchers should store
or pass those keys to their provider so duplicate requests return the original runtime instead of
creating duplicate compute.

Provider-specific examples:

- ECS: pass a deterministic `clientToken` to `RunTask`.
- Fly: store the key in Machine metadata and query for an existing Machine.
- Kubernetes: use a deterministic Job name or an annotation keyed by the idempotency value.
