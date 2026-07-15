# Trace AWS infrastructure

This directory is the executable AWS CDK implementation of
`docs/aws-production-deployment-blueprint.md`.

It creates six production stacks:

- `Foundation`: VPC, subnets, NAT, endpoints, Route 53, ACM, KMS, ECR, and GitHub OIDC.
- `Data`: Aurora/RDS Proxy, Valkey, EFS, S3, SQS, and application secrets.
- `Runtime`: isolated Fargate task definition, launcher API, runtime registry, and lifecycle queue.
- `ControlPlane`: web/API ECS services, ALB routing, WAF, managed-Git mount, and migration task.
- `AppDeployment`: generated-app cluster, build project, repositories, queues, and deployment roles.
- `Observability`: CloudTrail, Config, Security Hub, GuardDuty, AWS Backup, alarms, dashboard, and budget.

Start with [the deployment runbook](../docs/aws-iac-deployment.md). Do not deploy the example
configuration as production. Copy it to `config/production.json`, supply the real account/domain,
and synthesize with:

```bash
pnpm install
pnpm infra:build
cd infra
pnpm exec cdk synth -c config=config/production.json
```
