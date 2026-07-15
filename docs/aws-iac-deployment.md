# Trace AWS IaC deployment runbook

This runbook bootstraps and deploys the CDK application in `infra/`. The production blueprint remains
the architectural source of truth; this document contains the operator steps that cannot be safely
inferred by CloudFormation.

## 1. Prerequisites

- A dedicated AWS production account.
- AWS CLI v2 and an AWS SSO administrator profile for the first deployment.
- Node 22, pnpm 10, Docker, and the AWS CDK CLI installed through this repository.
- A domain registered in Route 53 or a hosted zone that can receive Trace records.
- The production Fargate vCPU quota raised above the intended session concurrency.

The initial configuration uses one NAT Gateway, one API task, two web tasks, and no paid interface
endpoints. This is the cost-conscious 20-user production baseline. The API count is deliberately
fixed at one until runtime WebSocket ownership is extracted from the backend process.

## 2. Create the production configuration

```bash
cp infra/config/production.example.json infra/config/production.json
```

Edit `production.json`:

- Set `account` to the 12-digit production AWS account.
- Set `domainName` to the actual Trace production domain.
- Set `hostedZoneId` and `createHostedZone: false` when the zone already exists.
- Otherwise leave `createHostedZone: true`, deploy Foundation, and delegate the returned name
  servers from the parent zone or registrar.
- Keep `apiDesiredCount: 1`; configuration validation rejects unsafe horizontal API scaling.
- Select Aurora readers, NAT Gateways, and paid VPC endpoints based on the required availability
  target rather than enabling them by default.

Never put third-party credentials in this file. It contains only non-secret infrastructure settings.

## 3. Bootstrap CDK and deploy Foundation once

Authenticate through AWS SSO, then run:

```bash
pnpm install --frozen-lockfile
aws sso login --profile trace-production
pnpm --filter @trace/infra exec cdk bootstrap aws://ACCOUNT_ID/REGION \
  --profile trace-production \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
cd infra
pnpm exec cdk deploy Trace-prod-Foundation \
  --profile trace-production \
  --require-approval broadening \
  -c config=config/production.json
```

Review the change set before approving it. Foundation creates the KMS keys, image repositories,
certificate, hosted zone/import, VPC, and the branch-restricted GitHub OIDC deployment role.

If CDK created the hosted zone, delegate the `NameServers` output before continuing so ACM can
validate the public certificate.

## 4. Configure GitHub production deployment

Create a protected GitHub environment named `production` with required reviewers. Add these
repository/environment variables:

| Variable                 | Value                                   |
| ------------------------ | --------------------------------------- |
| `AWS_ACCOUNT_ID`         | Production account ID                   |
| `AWS_REGION`             | For example `us-east-1`                 |
| `AWS_DEPLOY_ROLE_ARN`    | `GitHubDeployRoleArn` Foundation output |
| `TRACE_DOMAIN_NAME`      | Production Trace domain                 |
| `ROUTE53_HOSTED_ZONE_ID` | Existing or newly created zone ID       |
| `MONTHLY_BUDGET_USD`     | Initially `500`                         |
| `ALERT_EMAIL`            | Production operations email             |

Add `VITE_AG_GRID_LICENSE_KEY` as a GitHub environment secret when the production web build uses it.

Run the **Deploy AWS Production** workflow. It:

1. Assumes the AWS role through GitHub OIDC.
2. Renders a non-secret, commit-specific production configuration.
3. Synthesizes CDK and deploys Foundation.
4. Builds and pushes commit-addressed control-plane and runtime images.
5. Deploys Data, Runtime, ControlPlane, AppDeployment, and Observability.
6. Runs Prisma migrations as an isolated one-off Fargate task.
7. Refreshes the web/API services and waits for them to stabilize.

The retired EC2/SSH deployment workflow is intentionally removed; CDK is authoritative for AWS
production.

## 5. Populate integration secrets

CDK generates the JWT, token-encryption, database, and launcher secrets. It creates the following
integration secret with empty optional values:

```text
trace/prod/integrations
```

Update its JSON value through a restricted operator role or CI secret synchronization:

```json
{
  "GITHUB_CLIENT_ID": "...",
  "GITHUB_CLIENT_SECRET": "...",
  "SLACK_CLIENT_ID": "",
  "SLACK_CLIENT_SECRET": "",
  "SLACK_SIGNING_SECRET": "",
  "APPLE_TEAM_ID": ""
}
```

After rotating an ECS-injected secret, force a new API deployment; running containers do not receive
rotated environment values automatically.

## 6. Configure Trace's production Agent Environment

Read the launcher token only from an authorized operator session:

```bash
aws secretsmanager get-secret-value \
  --secret-id trace/prod/runtime-launcher-token \
  --query SecretString \
  --output text
```

Store that token as an organization secret in Trace. Use the returned Trace secret ID in the
production Agent Environment configuration:

```json
{
  "startUrl": "https://launcher.TRACE_DOMAIN/start",
  "stopUrl": "https://launcher.TRACE_DOMAIN/stop",
  "statusUrl": "https://launcher.TRACE_DOMAIN/status",
  "auth": {
    "type": "bearer",
    "secretId": "TRACE_ORG_SECRET_ID"
  },
  "startupTimeoutSeconds": 180,
  "deprovisionPolicy": "on_session_end",
  "runtimeEnv": [],
  "launcherMetadata": {
    "provider": "aws",
    "compute": "fargate",
    "profile": "standard"
  }
}
```

The launcher maps this fixed profile to the CDK-owned cluster, task definition, subnets, security
group, and roles. Organization input cannot override those infrastructure identifiers.

## 7. Production verification

- Confirm `https://TRACE_DOMAIN/health` returns `ready: true`.
- Sign in, create an organization, and test GraphQL subscriptions.
- Push and clone a Trace-managed repository through `/git`.
- Create and test the provisioned Agent Environment.
- Start a canary cloud session and confirm one isolated runtime task appears.
- Stop the session and verify the task stops and the launcher remains idempotent.
- Upload and retrieve an S3-backed artifact.
- Verify CloudWatch alarms, AWS Backup jobs, CloudTrail delivery, GuardDuty, Config, and the budget.
- Run the functional, scale, failure, and restore gates from the production blueprint before raising
  concurrency.

## 8. Changes and teardown

Run `cdk diff` for every infrastructure change. Production data resources, repositories, buckets,
keys, and stacks use retention and termination protection by default. Destructive teardown therefore
requires an explicit configuration change and a reviewed deployment; deleting a stack is not the
normal product group-deletion path.
