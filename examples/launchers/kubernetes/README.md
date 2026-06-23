# Trace Kubernetes Job Launcher Reference

This reference describes an org-owned launcher that maps Trace provisioned lifecycle requests to
Kubernetes Jobs. It is intentionally outside Trace core and can be implemented as a small HTTPS
service running inside or outside the cluster.

## Shape

Expose the generic Trace lifecycle endpoints:

- `POST /trace/start-session` creates a Job
- `POST /trace/stop-session` deletes or terminates the Job
- `POST /trace/session-status` reads the Job and Pod status

The Job container should run the Trace runtime image, for example
`ghcr.io/<trace-owner>/trace-agent-runtime:runtime-v1.2.3`, or an organization-derived image built
from it. After the Pod starts, the runtime connects back to Trace using `TRACE_BRIDGE_URL` and
`TRACE_RUNTIME_TOKEN`.

For stable organization tools, bake a derived runtime image and use that image in the Job template:

```dockerfile
FROM ghcr.io/<trace-owner>/trace-agent-runtime:runtime-v1.2.3

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends jq ripgrep \
  && rm -rf /var/lib/apt/lists/*

USER coder
RUN npm install -g @acme/internal-cli
```

## Start Mapping

Create one Job per Trace runtime. Use a deterministic name from `runtimeInstanceId` or a sanitized
hash of `Trace-Idempotency-Key`, for example:

```txt
trace-runtime-runtime-abc123
```

Set labels or annotations for lookup and reconciliation:

```yaml
metadata:
  labels:
    app.kubernetes.io/name: trace-runtime
    trace.trace.dev/session-id: sess-123
    trace.trace.dev/org-id: org-123
  annotations:
    trace.trace.dev/runtime-instance-id: runtime-abc123
    trace.trace.dev/idempotency-key: session:sess-123:start
```

Set `restartPolicy: Never` and inject every key from the start-session `bootstrapEnv` object into
the runtime container. Today that includes these core env vars:

```yaml
env:
  - name: TRACE_SESSION_ID
    value: sess-123
  - name: TRACE_ORG_ID
    value: org-123
  - name: TRACE_RUNTIME_INSTANCE_ID
    value: runtime-abc123
  - name: TRACE_RUNTIME_TOKEN
    valueFrom:
      secretKeyRef:
        name: trace-runtime-runtime-abc123
        key: runtime-token
  - name: TRACE_BRIDGE_URL
    value: wss://trace.example.com/bridge
```

`bootstrapEnv` may also include optional sensitive values such as `TRACE_MCP_CONFIG`. Prefer
short-lived Secrets for `TRACE_RUNTIME_TOKEN`, `TRACE_MCP_CONFIG`, and other sensitive bootstrap
values instead of placing them directly in the Job manifest.

Return the Job name or UID as `runtimeId`:

```json
{
  "runtimeId": "trace-runtime-runtime-abc123",
  "runtimeUrl": "https://kubernetes.default.svc/apis/batch/v1/namespaces/trace/jobs/trace-runtime-runtime-abc123",
  "label": "Kubernetes Job runtime-abc123",
  "status": "provisioning"
}
```

## Stop Mapping

For `POST /trace/stop-session`, delete the Job with foreground or background propagation and remove
the runtime token Secret.

Return an idempotent success if the Job or Secret is already gone:

```json
{
  "ok": true,
  "status": "stopping"
}
```

## Status Mapping

For `POST /trace/session-status`, read the Job and its Pods.

Map Kubernetes state to Trace status:

| Kubernetes state | Trace status |
| --- | --- |
| Job exists, no Pod scheduled | `provisioning` |
| Pod `Pending` or containers waiting | `booting` |
| Pod `Running` | `connected` |
| Job deletion timestamp set | `stopping` |
| Job succeeded, failed, or not found | `stopped` or `failed` based on exit reason |
| unreadable/ambiguous state | `unknown` |

Trace still waits for runtime bridge readiness. A running Pod is not enough to mark the agent ready
unless the bridge has connected.

## RBAC

Scope the launcher service account to one namespace whenever possible:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: trace-runtime-launcher
  namespace: trace
rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["create", "get", "list", "delete"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["create", "get", "delete"]
```

Avoid cluster-wide permissions unless the launcher intentionally manages runtimes across namespaces.

## Networking

Runtime Pods need outbound network access to:

- `TRACE_BRIDGE_URL`
- git hosts used by configured repos
- package registries needed by the coding tool
- model/provider APIs used by the selected tool

They should not require inbound access. Use NetworkPolicy where available to constrain egress.

## Idempotency

Use deterministic Job names or store `Trace-Idempotency-Key` as an annotation. Duplicate start calls
with the same key should return the existing Job. Duplicate stop calls should succeed if the Job is
already terminating or gone.

## Security

The launcher should require HTTPS and validate bearer or HMAC Trace auth before creating cluster
resources. Do not log launcher bearer tokens, runtime tokens, kubeconfig contents, or git/model
credentials.
