# Ticket 13: Quality Gates, Observability & Delivery

## Goal

Add the non-negotiable operational work required to call the system production-ready: CI, automated verification, release controls, observability, runbooks, and migration rollout safety.

## Context

The current repo has major delivery gaps:

- there is no `.github/workflows/` pipeline in the repo
- the web and desktop apps currently have no first-class automated test suites
- root scripts are minimal and do not define a standard build/test path
- deployment/runbook/rollback/backfill guidance is not captured in `docs/migration`

Without this ticket, the codebase may be cleaner, but the operating model is still weak.

## Tasks

### 1. Add CI for the whole workspace

Create pipelines that run at minimum:

- codegen drift check
- typecheck
- unit/integration tests
- production builds for server/web/desktop
- lint/format checks

PRs should not merge unless these pass.

### 2. Add automated user-flow coverage

Introduce:

- web smoke/e2e tests
- desktop smoke/e2e tests

Cover the highest-value flows:

- auth/login
- connect instance
- create workspace
- spawn/stop agent
- receive thread events
- switch workspaces
- recover after reconnect

### 3. Add linting and repo-health checks

At the root level, enforce:

- ESLint / formatting
- dependency drift checks
- generated-file drift checks
- dead-file / dead-export checks where practical

### 4. Add observability and alerting

Define a baseline telemetry stack for:

- structured logs
- error reporting
- request latency
- relay latency
- workspace status freshness
- queue/backlog metrics
- reconnect rates / failure rates

Then document the alerts that actually matter.

### 5. Create deployment and rollback runbooks

Document:

- environment matrix
- secrets management
- database migration rollout
- outbox/backfill rollout if Ticket 10 adds it
- canary / phased rollout
- rollback steps
- data backup/restore procedures

### 6. Define service-level expectations

Write down target SLOs for:

- workspace switch latency
- status freshness
- relay round-trip latency
- server error rate
- reconnect recovery time

If you do not define "healthy," you cannot operate toward it.

### 7. Update top-level project docs

Refresh root onboarding and operation docs so they match the actual monorepo:

- correct app paths
- correct commands
- correct environment setup
- correct build/test workflow

### 8. Require the gates before calling the rewrite done

The migration is not "done" when the code looks cleaner. It is done when:

- the pipeline proves it
- operators can deploy it
- engineers can debug it
- migrations can roll forward and backward safely

## Verification

1. CI runs on every PR and blocks merges on failure.
2. Web and desktop smoke tests pass in automation.
3. Root `build`, `test`, `typecheck`, and `lint` commands work.
4. Release/runbook docs exist and are current.
5. Observability dashboards/alerts cover the core runtime paths.
6. A dry-run migration + rollback procedure has been executed successfully.

## Files Changed

- **Created**: CI workflows, smoke/e2e suites, runbooks, ops docs, telemetry config
- **Modified**: root docs, root scripts, app/package scripts, deployment config as needed
- **Possibly modified**: server/web/desktop startup paths to emit telemetry and support health checks

## Dependencies

- This is the final gate over Tickets 1-12.
- Some CI scaffolding should land early, but the completion bar for this ticket only closes at the end of the program.
