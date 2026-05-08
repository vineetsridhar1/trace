# Company Infrastructure Deployment Plan

This is the practical checklist for deploying Trace on company infrastructure with:

- Trace web/API hosted by the company.
- Provisioned cloud runtimes launched in an EKS namespace.
- A company desktop binary that connects to the company Trace server by default.

## Target Architecture

```text
Desktop / Browser
      |
      v
Company Trace URL
      |
      +--> web role: serves apps/web/dist
      |
      +--> backend role: GraphQL, auth, /ws, /bridge, /terminal
                |
                +--> PostgreSQL + pgvector
                +--> Redis
                +--> S3-compatible object storage
                |
                +--> provisioned Agent Environment
                          |
                          v
                    EKS launcher service
                          |
                          v
                    per-session Kubernetes Job
                          |
                          v
                    trace container bridge connects back to wss://company-trace/bridge
```

Trace core already has the provisioned-runtime abstraction. The EKS control plane should be a
small org-owned launcher service that implements the existing lifecycle contract. It should not
create events directly and should not call GraphQL for agent traffic.

## 1. Deploy Trace Server

Use the root `Dockerfile`; it builds one image that can run either role:

- `ROLE=web` serves the Vite build on port `3000`.
- `ROLE=backend` runs Prisma migrations and starts the API on port `4000`.

Required backing services:

- PostgreSQL with `pgvector` enabled.
- Redis.
- S3-compatible object storage for uploads.
- Public HTTPS ingress that supports WebSocket upgrades.

Important backend environment:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
TOKEN_ENCRYPTION_KEY=...
TRACE_WEB_URL=https://trace.company.example
TRACE_SERVER_PUBLIC_URL=https://trace.company.example
CORS_ALLOWED_ORIGINS=https://trace.company.example
TRACE_AUTH_COOKIE_SAME_SITE=lax
S3_BUCKET=...
AWS_REGION=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GITHUB_TOKEN=...
```

The public Trace URL must route these paths to the backend:

```text
/auth*
/graphql*
/uploads*
/webhooks/github*
/ws*
/bridge*
/terminal*
/health
```

Everything else can route to the web role. If web and backend are served from the same origin,
the web build can leave `VITE_API_URL` empty. If they are split across domains, build the image with
`VITE_API_URL=https://api-trace.company.example`.

## 2. Build And Publish Runtime Image

The EKS Jobs should run the container bridge image from `apps/container-bridge/Dockerfile`.
That Dockerfile builds `apps/container-bridge/src/index.ts` into `/app/dist/index.js` inside the
image. The launcher never needs the Trace repo or `dist/index.js`; it only needs the final image
reference.

Build flow:

```bash
docker build -f apps/container-bridge/Dockerfile -t <registry>/trace-agent-runtime:<tag> .
docker push <registry>/trace-agent-runtime:<tag>
```

Runtime Pods need these secrets or env vars depending on enabled tools/repos:

- `TRACE_SESSION_ID`, `TRACE_ORG_ID`, `TRACE_RUNTIME_INSTANCE_ID`, `TRACE_RUNTIME_TOKEN`,
  `TRACE_BRIDGE_URL` from the launcher start request.
- `OPENAI_API_KEY` for Codex sessions.
- `ANTHROPIC_API_KEY` for Claude Code sessions.
- `GITHUB_TOKEN` or `SSH_PRIVATE_KEY` for private repo access.

## 3. Build The EKS Launcher Service

Use or adapt the executable example in `examples/launchers/kubernetes`. It is a small HTTPS service
reachable by the Trace backend:

- `POST /trace/start-session`
- `POST /trace/stop-session`
- `POST /trace/session-status`

Trace sends launcher requests from `apps/server/src/lib/runtime-adapters.ts`. Start requests include:

- `sessionId`, `sessionGroupId`, `orgId`
- `runtimeInstanceId`
- `runtimeToken`, `runtimeTokenExpiresAt`
- `bridgeUrl`
- `repo`
- `tool`, `model`, `reasoningEffort`
- `bootstrapEnv`
- `metadata.launcherMetadata`

For `start-session`, create:

- A short-lived Kubernetes Secret containing `TRACE_RUNTIME_TOKEN`.
- One Kubernetes Job named deterministically from `runtimeInstanceId`.
- Labels/annotations for `sessionId`, `orgId`, `runtimeInstanceId`, and `Trace-Idempotency-Key`.

Minimum Job container env:

```yaml
env:
  - name: TRACE_SESSION_ID
    value: "<from request>"
  - name: TRACE_ORG_ID
    value: "<from request>"
  - name: TRACE_RUNTIME_INSTANCE_ID
    value: "<from request>"
  - name: TRACE_BRIDGE_URL
    value: "wss://trace.company.example/bridge"
  - name: TRACE_RUNTIME_TOKEN
    valueFrom:
      secretKeyRef:
        name: "<per-runtime-secret>"
        key: runtime-token
```

Use `metadata.launcherMetadata` for company-specific settings such as namespace, runtime image,
service account, resource requests/limits, node selectors, tolerations, and extra env secret refs.

For `stop-session`, delete the Job and its runtime-token Secret. Return success if they are already
gone.

For `session-status`, read the Job and Pods and map Kubernetes state to Trace runtime status:

- Job exists but no Pod: `provisioning`
- Pod pending or waiting: `booting`
- Pod running: `connected`
- Deleting: `stopping`
- Succeeded/not found: `stopped`
- Failed: `failed`
- Ambiguous: `unknown`

Trace still waits for the runtime bridge to connect before marking the runtime usable, so a running
Pod alone is not enough.

## 4. Ask The Infra Team For These EKS Details

You need the following from the company platform team:

- Namespace name.
- Container registry URL and push permissions for the runtime image and launcher image.
- ServiceAccount for the launcher.
- RBAC allowing the launcher to create/get/list/delete Jobs and Secrets, and get/list Pods in only
  that namespace.
- Ingress or internal service URL that the Trace backend can reach for launcher HTTPS endpoints.
- TLS/certificate approach for the launcher URL.
- NetworkPolicy rules allowing runtime Pods outbound access to:
  - `wss://trace.company.example/bridge`
  - Git hosts
  - package registries
  - OpenAI/Anthropic or the company model gateway
- CPU/memory defaults and maximum concurrent runtime quota.
- Where launcher/runtime secrets should live.
- Whether Pods may run without persistent volumes. The current container bridge can use ephemeral
  `/repos` and `/workspaces`; persistent volumes are optional but can improve clone time.

## 5. Configure Trace Agent Environment

In Trace settings:

1. Create an organization secret containing the launcher bearer token.
2. Create a provisioned Agent Environment:

```json
{
  "startUrl": "https://trace-launcher.company.example/trace/start-session",
  "stopUrl": "https://trace-launcher.company.example/trace/stop-session",
  "statusUrl": "https://trace-launcher.company.example/trace/session-status",
  "auth": { "type": "bearer", "secretId": "<org-secret-id>" },
  "startupTimeoutSeconds": 180,
  "deprovisionPolicy": "on_session_end",
  "launcherMetadata": {
    "namespace": "trace-runtimes",
    "image": "<registry>/trace-agent-runtime:<tag>",
    "serviceAccountName": "trace-runtime",
    "resources": {
      "requests": { "cpu": "1", "memory": "2Gi" },
      "limits": { "cpu": "4", "memory": "8Gi" }
    }
  }
}
```

Only one enabled provisioned environment is currently allowed per organization.

## 6. Desktop Binary

The desktop app connects to URLs from environment variables:

```env
TRACE_SERVER_URL=https://trace.company.example
TRACE_WEB_URL=https://trace.company.example
```

If those are not set, the app defaults to local development URLs. For an end-user company binary,
choose one of these approaches:

- Ship a wrapper/launcher that sets `TRACE_SERVER_URL` and `TRACE_WEB_URL` before starting the app.
- Add a small desktop release config file or build-time default so packaged apps do not depend on
  user environment variables.

Current packaging commands:

```bash
pnpm --filter @trace/desktop build
pnpm --filter @trace/desktop make
```

The current code does not bake company endpoints into the packaged app by itself.

## 7. Smoke Test Order

1. Open `https://trace.company.example/health` and verify backend readiness.
2. Load the web app and sign in.
3. Run a desktop build with `TRACE_SERVER_URL` and `TRACE_WEB_URL` pointed at the company URL.
4. Create the launcher org secret and provisioned Agent Environment.
5. Use the Agent Environment test button.
6. Start a cloud session against a small repo.
7. Confirm the launcher creates one Job and one runtime-token Secret.
8. Confirm the runtime Pod opens a WebSocket to `/bridge`.
9. Confirm session output appears in Trace.
10. Stop the session and confirm the Job and Secret are removed.

## Open Implementation Gaps

- There is an executable Kubernetes launcher example, but no production Helm chart yet for the
  Trace server, launcher, or runtime RBAC.
- The desktop package has runtime endpoint env vars but no build-time company endpoint config.
