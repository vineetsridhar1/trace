# Trace AWS ECS Fargate Launcher Reference

This reference describes an org-owned launcher that maps Trace provisioned lifecycle requests to AWS
ECS Fargate tasks. It is intentionally outside Trace core: Trace only talks to the generic
`startUrl`, `stopUrl`, and `statusUrl` configured on an Agent Environment.

## Shape

Run a small HTTPS service in your VPC, for example behind an internal or public Application Load
Balancer:

- `POST /trace/start-session` calls `ecs:RunTask`
- `POST /trace/stop-session` calls `ecs:StopTask`
- `POST /trace/session-status` calls `ecs:DescribeTasks`

The ECS task image should run `trace-agent-runtime`. The launcher only starts infrastructure; after
the task boots, the runtime connects to Trace over `TRACE_BRIDGE_URL`.

## Agent Environment Config

Configure a provisioned Agent Environment with launcher URLs:

```json
{
  "startUrl": "https://launcher.example.com/trace/start-session",
  "stopUrl": "https://launcher.example.com/trace/stop-session",
  "statusUrl": "https://launcher.example.com/trace/session-status",
  "auth": {
    "type": "bearer",
    "secretId": "org_secret_launcher_token"
  },
  "startupTimeoutSeconds": 180,
  "deprovisionPolicy": "on_session_end",
  "launcherMetadata": {
    "clusterArn": "arn:aws:ecs:us-east-1:123456789012:cluster/trace-runtime",
    "taskDefinitionArn": "arn:aws:ecs:us-east-1:123456789012:task-definition/trace-runtime:1",
    "subnetIds": ["subnet-abc", "subnet-def"],
    "securityGroupIds": ["sg-abc"]
  }
}
```

The launcher may also read cluster, task definition, subnet, and security group settings from its own
environment instead of trusting request metadata.

## Start Mapping

For `POST /trace/start-session`, validate auth, validate the JSON body, and call `RunTask`.

Recommended ECS inputs:

- `cluster`: configured cluster ARN
- `taskDefinition`: configured runtime task definition ARN
- `launchType`: `FARGATE`
- `count`: `1`
- `clientToken`: deterministic value derived from `Trace-Idempotency-Key`
- `networkConfiguration.awsvpcConfiguration.subnets`: private subnet IDs
- `networkConfiguration.awsvpcConfiguration.securityGroups`: runtime security group IDs
- `networkConfiguration.awsvpcConfiguration.assignPublicIp`: `DISABLED` for private VPC egress, or
  `ENABLED` only when intentional
- `overrides.containerOverrides[].environment`: Trace bootstrap env vars plus optional repo/tool env

Inject these runtime env vars:

```txt
TRACE_SESSION_ID
TRACE_ORG_ID
TRACE_RUNTIME_INSTANCE_ID
TRACE_RUNTIME_TOKEN
TRACE_BRIDGE_URL
TRACE_TOOL
TRACE_MODEL
TRACE_REPO_URL
TRACE_REPO_BRANCH
```

Return the ECS task ARN as `runtimeId`:

```json
{
  "runtimeId": "arn:aws:ecs:us-east-1:123456789012:task/trace-runtime/abc",
  "runtimeUrl": "https://console.aws.amazon.com/ecs/v2/clusters/trace-runtime/tasks/abc",
  "label": "ECS Fargate abc",
  "status": "provisioning"
}
```

## Stop Mapping

For `POST /trace/stop-session`, call `StopTask` with the `runtimeId` task ARN and return:

```json
{
  "ok": true,
  "status": "stopping"
}
```

If the task is already stopped or missing, return a successful idempotent response with `stopped`.

## Status Mapping

For `POST /trace/session-status`, call `DescribeTasks` with the task ARN.

Map ECS task state to Trace status:

| ECS state | Trace status |
| --- | --- |
| `PROVISIONING`, `PENDING` | `provisioning` |
| `ACTIVATING` | `booting` |
| `RUNNING` | `connected` |
| `DEACTIVATING`, `STOPPING`, `DEPROVISIONING` | `stopping` |
| `STOPPED`, missing task | `stopped` |
| other/unknown | `unknown` |

Trace still treats the runtime as ready only when the bridge connects back. A `RUNNING` ECS task does
not by itself mean the agent bridge is usable.

## IAM

The launcher task or Lambda needs only the ECS permissions required for the configured cluster:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecs:RunTask", "ecs:StopTask", "ecs:DescribeTasks"],
      "Resource": [
        "arn:aws:ecs:us-east-1:123456789012:cluster/trace-runtime",
        "arn:aws:ecs:us-east-1:123456789012:task/trace-runtime/*",
        "arn:aws:ecs:us-east-1:123456789012:task-definition/trace-runtime:*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::123456789012:role/trace-runtime-task-role",
        "arn:aws:iam::123456789012:role/trace-runtime-execution-role"
      ]
    }
  ]
}
```

Constrain resources, regions, clusters, and roles to your deployment. Do not grant wildcard ECS
access to the launcher.

## Networking

For private company code, prefer:

- private subnets for runtime tasks
- NAT or VPC endpoints for outbound access to Trace, package registries, and git hosts
- security group egress limited to required destinations where practical
- no inbound ports on runtime tasks
- secrets delivered through AWS Secrets Manager, SSM Parameter Store, or tightly scoped task env vars

The runtime must be able to open an outbound WebSocket to `TRACE_BRIDGE_URL`.

## Idempotency

Use the incoming `Trace-Idempotency-Key` to derive the ECS `clientToken` for `RunTask`. Store the
same key as a tag on the task when possible. For stop retries, treat missing or already stopped tasks
as success.

## Logging

Log request IDs, session IDs, runtime instance IDs, and task ARNs. Do not log:

- `Authorization`
- `TRACE_LAUNCHER_BEARER_TOKEN`
- `TRACE_RUNTIME_TOKEN`
- git credentials
- provider API credentials
