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
- An existing private RDS for PostgreSQL instance, its VPC, and at least two public and private
  subnets when using the recommended existing-database configuration.

The initial configuration uses one NAT Gateway, one API task, two web tasks, and no paid interface
endpoints. This is the cost-conscious 20-user production baseline. The API count is deliberately
fixed at one until runtime WebSocket ownership is extracted from the backend process.

## 2. Prepare the existing RDS database and VPC

The recommended initial production configuration imports the VPC containing the existing Trace RDS
database. CDK creates Trace resources in that VPC but does not create, modify, back up, replace, or
delete the imported VPC or database.

Before deployment:

1. Confirm the database engine is PostgreSQL and the application can connect with TLS.
2. Create and verify a manual RDS snapshot.
3. Enable Multi-AZ, automated backups, encryption, deletion protection, and database monitoring as
   appropriate for the existing instance.
4. Confirm the database is not publicly accessible.
5. Put the application username and password in one complete Secrets Manager secret:

   ```json
   {
     "username": "trace_application_user",
     "password": "REDACTED"
   }
   ```

6. Record the RDS endpoint, port, database name, DB instance identifier, security group ID, secret
   ARN, VPC ID, Availability Zones, subnet IDs, and each subnet's route table ID.
7. Choose at least two public subnets for the ALB and at least two private subnets for the control
   plane, session runtimes, and data services. The same private subnet IDs may be reused for those
   three groups when their route tables provide the required access.
8. Confirm the selected private subnets can reach ECR, S3, CloudWatch Logs, Secrets Manager, and the
   internet through NAT or existing VPC endpoints. Session tasks need outbound HTTPS access.

Useful discovery commands:

```bash
export AWS_REGION=us-east-1
export RDS_IDENTIFIER=YOUR_RDS_IDENTIFIER

aws rds describe-db-instances \
  --region "$AWS_REGION" \
  --db-instance-identifier "$RDS_IDENTIFIER" \
  --query 'DBInstances[0].{Endpoint:Endpoint.Address,Port:Endpoint.Port,VpcId:DBSubnetGroup.VpcId,SecurityGroups:VpcSecurityGroups[*].VpcSecurityGroupId,MultiAZ:MultiAZ,PubliclyAccessible:PubliclyAccessible}'

aws ec2 describe-subnets \
  --region "$AWS_REGION" \
  --filters "Name=vpc-id,Values=YOUR_VPC_ID" \
  --query 'Subnets[*].{SubnetId:SubnetId,AZ:AvailabilityZone,Cidr:CidrBlock,PublicIpOnLaunch:MapPublicIpOnLaunch}' \
  --output table

aws ec2 describe-route-tables \
  --region "$AWS_REGION" \
  --filters "Name=association.subnet-id,Values=YOUR_SUBNET_ID" \
  --query 'RouteTables[0].RouteTableId' \
  --output text
```

Repeat the route-table query for each selected subnet. Keep every route-table CSV in the same order
as its corresponding subnet CSV.

If the database secret uses a customer-managed KMS key, also record its key ARN. The deployment role
must be allowed to describe that key, and the ECS task execution role receives `kms:Decrypt` through
the synthesized stack. Do not put the database password in GitHub or the CDK configuration.

## 3. Create the production configuration

```bash
cp infra/config/production-existing-rds.example.json infra/config/production.json
```

Edit `production.json`:

- Set `account` to the 12-digit production AWS account.
- Set `domainName` to the actual Trace production domain.
- Replace every example VPC, subnet, RDS, security-group, and secret ARN value.
- Set `hostedZoneId` and `createHostedZone: false` when the zone already exists.
- Otherwise leave `createHostedZone: true`, deploy Foundation, and delegate the returned name
  servers from the parent zone or registrar.
- Keep `apiDesiredCount: 1`; configuration validation rejects unsafe horizontal API scaling.
- Keep `networkMode: "existing"` and `controlDatabaseMode: "existing"`.
- Keep `enableAppData: false` until the generated-app data service is implemented and needed.
- Keep `enablePaidVpcEndpoints: false`; CDK does not mutate endpoint topology in an imported VPC.

Never put third-party credentials in this file. It contains only non-secret infrastructure settings.

Validate both the config and synthesized change before touching AWS:

```bash
pnpm --filter @trace/infra build
cd infra
pnpm exec cdk synth -c config=config/production.json
pnpm exec cdk diff Trace-prod-Foundation -c config=config/production.json \
  --profile trace-production
```

## 4. Bootstrap CDK and deploy Foundation once

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

Review the change set before approving it. Foundation creates KMS keys, image repositories, the
certificate, hosted zone/import, and the GitHub OIDC deployment role. In existing-network mode, it
references the supplied VPC and subnets and does not create a VPC, NAT Gateway, route table, or VPC
endpoint.

The role trusts only the `production` GitHub environment. Configure that environment to require
reviewers and allow deployments only from `main`.

If CDK created the hosted zone, delegate the `NameServers` output before continuing so ACM can
validate the public certificate.

## 5. Configure GitHub production deployment

Create a protected GitHub environment named `production` with required reviewers. Add these
repository/environment variables:

| Variable                                       | Value                                      |
| ---------------------------------------------- | ------------------------------------------ |
| `AWS_ACCOUNT_ID`                               | Production account ID                      |
| `AWS_REGION`                                   | For example `us-east-1`                    |
| `AWS_DEPLOY_ROLE_ARN`                          | `GitHubDeployRoleArn` Foundation output    |
| `TRACE_DOMAIN_NAME`                            | Production Trace domain                    |
| `ROUTE53_HOSTED_ZONE_ID`                       | Existing or newly created zone ID          |
| `NETWORK_MODE`                                 | `existing`                                 |
| `EXISTING_VPC_ID`                              | VPC containing the current RDS instance    |
| `EXISTING_AVAILABILITY_ZONES`                  | Comma-separated AZs                        |
| `EXISTING_PUBLIC_SUBNET_IDS`                   | Comma-separated ALB subnet IDs             |
| `EXISTING_PUBLIC_ROUTE_TABLE_IDS`              | Route tables aligned with the ALB subnets  |
| `EXISTING_CONTROL_PLANE_SUBNET_IDS`            | Comma-separated private subnet IDs         |
| `EXISTING_CONTROL_PLANE_ROUTE_TABLE_IDS`       | Route tables aligned with control subnets  |
| `EXISTING_RUNTIME_SUBNET_IDS`                  | Comma-separated private subnet IDs         |
| `EXISTING_RUNTIME_ROUTE_TABLE_IDS`             | Route tables aligned with runtime subnets  |
| `EXISTING_DATA_SUBNET_IDS`                     | Comma-separated private subnet IDs         |
| `EXISTING_DATA_ROUTE_TABLE_IDS`                | Route tables aligned with data subnets     |
| `CONTROL_DATABASE_MODE`                        | `existing`                                 |
| `EXISTING_CONTROL_DATABASE_HOST`               | Current RDS endpoint                       |
| `EXISTING_CONTROL_DATABASE_PORT`               | Usually `5432`                             |
| `EXISTING_CONTROL_DATABASE_NAME`               | Existing Trace database name               |
| `EXISTING_CONTROL_DATABASE_IDENTIFIER`         | RDS DB instance identifier                 |
| `EXISTING_CONTROL_DATABASE_SECRET_ARN`         | Complete Secrets Manager secret ARN        |
| `EXISTING_CONTROL_DATABASE_SECRET_KMS_KEY_ARN` | KMS key ARN, blank for the AWS-managed key |
| `EXISTING_CONTROL_DATABASE_SECURITY_GROUP_ID`  | Security group attached to RDS             |
| `ENABLE_APP_DATA`                              | Initially `false`                          |
| `MONTHLY_BUDGET_USD`                           | Initially `500`                            |
| `ALERT_EMAIL`                                  | Production operations email                |

Add `VITE_AG_GRID_LICENSE_KEY` as a GitHub environment secret when the production web build uses it.

Run the **Deploy AWS Production** workflow. It:

1. Assumes the AWS role through GitHub OIDC.
2. Renders a non-secret, commit-specific production configuration.
3. Synthesizes CDK and deploys Foundation.
4. Builds and pushes commit-addressed control-plane and runtime images.
5. Deploys Data, Runtime, ControlPlane, AppDeployment, and Observability.
6. Authorizes the Trace API/migration security group on the existing RDS security group.
7. Runs Prisma migrations against the existing RDS database as an isolated one-off Fargate task.
8. Refreshes the web/API services and waits for them to stabilize.

The retired EC2/SSH deployment workflow is intentionally removed; CDK is authoritative for AWS
production.

The migration changes the existing database schema. Take the snapshot immediately before the first
workflow run and execute it during a maintenance window. `prisma migrate deploy` is idempotent for
already-applied migrations, but the snapshot remains the rollback boundary.

## 6. Populate integration secrets

CDK generates the JWT, token-encryption, and launcher secrets. The existing database secret remains
externally owned. CDK also creates the following integration secret with empty optional values:

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

## 7. Configure Trace's production Agent Environment

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

## 8. Production verification

- Confirm `https://TRACE_DOMAIN/health` returns `ready: true`.
- Sign in, create an organization, and test GraphQL subscriptions.
- Push and clone a Trace-managed repository through `/git`.
- Create and test the provisioned Agent Environment.
- Start a canary cloud session and confirm one isolated runtime task appears.
- Stop the session and verify the task stops and the launcher remains idempotent.
- Upload and retrieve an S3-backed artifact.
- Verify CloudWatch alarms, AWS Backup jobs, CloudTrail delivery, GuardDuty, Config, and the budget.
- Verify the existing RDS automated backup and snapshot policies separately. The Trace AWS Backup
  plan intentionally does not claim ownership of the imported database.
- Run the functional, scale, failure, and restore gates from the production blueprint before raising
  concurrency.

## 9. Changes and teardown

Run `cdk diff` for every infrastructure change. Production data resources, repositories, buckets,
keys, and stacks use retention and termination protection by default. Destructive teardown therefore
requires an explicit configuration change and a reviewed deployment; deleting a stack is not the
normal product group-deletion path. Imported VPC and RDS resources are never deleted with these
stacks.
