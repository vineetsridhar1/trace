# Trace Kubernetes Job Launcher

This example is an org-owned launcher that maps Trace provisioned lifecycle requests to Kubernetes
Jobs. It is intentionally outside Trace core and runs as a small HTTPS service inside or outside the
cluster.

## Run Locally

```bash
cd examples/launchers/kubernetes
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

For local development with a kubeconfig, the launcher uses `loadFromDefault()`. In-cluster
deployments use the mounted service account automatically.

## Configuration

```env
PORT=8787
TRACE_LAUNCHER_BEARER_TOKEN=replace-me
K8S_NAMESPACE=trace-runtimes
TRACE_RUNTIME_IMAGE=registry.example.com/trace-agent-runtime:latest
TRACE_RUNTIME_SERVICE_ACCOUNT=trace-runtime
TRACE_RUNTIME_CPU_REQUEST=1
TRACE_RUNTIME_MEMORY_REQUEST=2Gi
TRACE_RUNTIME_CPU_LIMIT=4
TRACE_RUNTIME_MEMORY_LIMIT=8Gi
TRACE_RUNTIME_IMAGE_PULL_SECRET_NAMES=registry-credentials
TRACE_RUNTIME_ENV_SECRET_NAMES=trace-runtime-tool-secrets
TRACE_RUNTIME_PASSTHROUGH_ENV=OPENAI_API_KEY,ANTHROPIC_API_KEY,GITHUB_TOKEN
```

`TRACE_RUNTIME_IMAGE_PULL_SECRET_NAMES` is used as image pull secrets for the runtime Pod.
`TRACE_RUNTIME_ENV_SECRET_NAMES` is added with `envFrom` for tool and repo credentials. For local
development only, selected launcher env vars can also be copied into the runtime Pod with
`TRACE_RUNTIME_PASSTHROUGH_ENV`.

## Build

```bash
pnpm test
pnpm build
docker build -t registry.example.com/trace-kubernetes-launcher:latest .
docker push registry.example.com/trace-kubernetes-launcher:latest
```

## Shape

Expose the generic Trace lifecycle endpoints:

- `POST /trace/start-session` creates a Job
- `POST /trace/stop-session` deletes or terminates the Job
- `POST /trace/session-status` reads the Job and Pod status

The Job container should run `trace-agent-runtime`. After the Pod starts, the runtime connects back
to Trace using `TRACE_BRIDGE_URL` and `TRACE_RUNTIME_TOKEN`.

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

Set `restartPolicy: Never` and inject the Trace bootstrap env vars into the runtime container:

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

Prefer a short-lived Secret for `TRACE_RUNTIME_TOKEN` instead of placing the token directly in the
Job manifest.

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

| Kubernetes state                    | Trace status                               |
| ----------------------------------- | ------------------------------------------ |
| Job exists, no Pod scheduled        | `provisioning`                             |
| Pod `Pending` or containers waiting | `booting`                                  |
| Pod `Running`                       | `connected`                                |
| Job deletion timestamp set          | `stopping`                                 |
| Job succeeded, failed, or not found | `stopped` or `failed` based on exit reason |
| unreadable/ambiguous state          | `unknown`                                  |

Trace still waits for runtime bridge readiness. A running Pod is not enough to mark the agent ready
unless the bridge has connected.

## RBAC

Scope the launcher service account to one namespace whenever possible.

Launcher service account:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: trace-kubernetes-launcher
  namespace: trace
```

Runtime service account:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: trace-runtime
  namespace: trace
```

Launcher Role:

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

RoleBinding:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: trace-runtime-launcher
  namespace: trace
subjects:
  - kind: ServiceAccount
    name: trace-kubernetes-launcher
    namespace: trace
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: trace-runtime-launcher
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
