# Trace Fly Session Controller

Small Express controller for Trace provisioned runtime sessions on Fly.io Machines.

Trace calls this service with a shared bearer secret. The controller validates the request, creates or stops ephemeral Fly Machines through the Machines API, and reports Machine status back to Trace. The runtime image is responsible for connecting to `TRACE_BRIDGE_URL` with `TRACE_RUNTIME_TOKEN`; this controller only provisions infrastructure.

## Fly API

This controller uses the official Fly Machines API at `https://api.machines.dev`:

- `POST /v1/apps/{app_name}/machines`
- `GET /v1/apps/{app_name}/machines/{machine_id}`
- `POST /v1/apps/{app_name}/machines/{machine_id}/stop`
- `DELETE /v1/apps/{app_name}/machines/{machine_id}`

Create requests set `config.env`, `config.guest`, `config.metadata`, and `config.restart.policy: "no"`.

## Local Setup

```bash
cd apps/fly-session-controller
cp .env.example .env
$EDITOR .env
pnpm install
pnpm dev
```

Required environment variables:

```bash
PORT=8787
TRACE_LAUNCHER_BEARER_TOKEN=<shared secret Trace uses to call this controller>
FLY_API_TOKEN=<Fly API token>
FLY_APP_NAME=<existing Fly app that will own runtime Machines>
FLY_REGION=iad
TRACE_RUNTIME_IMAGE=<Docker image to run for each Trace runtime>
FLY_MACHINE_CPU_KIND=shared
FLY_MACHINE_CPUS=1
FLY_MACHINE_MEMORY_MB=1024
FLY_DELETE_AFTER_STOP=true
TRACE_RUNTIME_PASSTHROUGH_ENV=GITHUB_TOKEN,OPENAI_API_KEY,ANTHROPIC_API_KEY,SSH_PRIVATE_KEY
```

Do not hardcode secrets. Fly API calls use `Authorization: Bearer $FLY_API_TOKEN`.

For private GitHub repos and coding-tool auth, set only the env vars you want copied into each
runtime Machine and list them in `TRACE_RUNTIME_PASSTHROUGH_ENV`. Common values:

```bash
GITHUB_TOKEN=<GitHub token with repo read access>
OPENAI_API_KEY=<required for codex>
ANTHROPIC_API_KEY=<required for claude_code>
SSH_PRIVATE_KEY=<base64-encoded SSH private key>
```

The controller injects only the named variables that are present in its environment.

## Trace Agent Environment

Create a Trace Agent Environment with:

- Start URL: `http://localhost:8787/trace/start-session`
- Stop URL: `http://localhost:8787/trace/stop-session`
- Status URL: `http://localhost:8787/trace/session-status`
- Bearer secret ID: the Trace org secret ID whose plaintext value equals `TRACE_LAUNCHER_BEARER_TOKEN`

For a deployed controller, replace `localhost:8787` with the controller's public URL.

## Idempotency

If Trace sends `Trace-Idempotency-Key`, the controller stores it in Fly Machine metadata and checks existing Machines with `metadata.trace_idempotency_key` before creating a new Machine. This avoids duplicate Machines for retried start requests.

## Logging

Logs include request IDs, session IDs, runtime IDs, and Fly Machine IDs. The controller does not log `runtimeToken`, `FLY_API_TOKEN`, or bearer secrets.

## curl Examples

Start a session:

```bash
curl -sS http://localhost:8787/trace/start-session \
  -H "Authorization: Bearer $TRACE_LAUNCHER_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Trace-Idempotency-Key: session-123-runtime-456" \
  -d '{
    "sessionId": "session-123",
    "sessionGroupId": null,
    "orgId": "org-123",
    "runtimeInstanceId": "runtime-456",
    "runtimeToken": "runtime-token",
    "runtimeTokenExpiresAt": "2026-04-30T00:00:00.000Z",
    "runtimeTokenScope": "session",
    "bridgeUrl": "wss://trace.example/bridge",
    "repo": {
      "id": "repo-123",
      "name": "trace",
      "remoteUrl": "https://github.com/example/trace.git",
      "defaultBranch": "main",
      "branch": null,
      "checkpointSha": null,
      "readOnly": false
    },
    "tool": "codex",
    "model": "gpt-5",
    "bootstrapEnv": {
      "TRACE_SESSION_ID": "session-123",
      "TRACE_ORG_ID": "org-123",
      "TRACE_RUNTIME_INSTANCE_ID": "runtime-456",
      "TRACE_RUNTIME_TOKEN": "runtime-token",
      "TRACE_BRIDGE_URL": "wss://trace.example/bridge"
    },
    "metadata": {
      "requestedBy": "user-123",
      "environmentId": "env-123",
      "launcherMetadata": {}
    }
  }'
```

Stop a session:

```bash
curl -sS http://localhost:8787/trace/stop-session \
  -H "Authorization: Bearer $TRACE_LAUNCHER_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "runtimeId": "fly-machine-id",
    "reason": "session_stopped"
  }'
```

Check status:

```bash
curl -sS http://localhost:8787/trace/session-status \
  -H "Authorization: Bearer $TRACE_LAUNCHER_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "runtimeId": "fly-machine-id"
  }'
```

## Docker

Build the controller image:

```bash
docker build -f apps/fly-session-controller/Dockerfile -t trace-fly-session-controller .
```

Run it:

```bash
docker run --rm -p 8787:8787 --env-file apps/fly-session-controller/.env trace-fly-session-controller
```
