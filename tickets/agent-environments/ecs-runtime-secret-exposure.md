# ECS runtime secret exposure remediation

## Summary

The production ECS runtime launcher passes the complete `bootstrapEnv` object to
`ecs:RunTask` as `overrides.containerOverrides[].environment`. ECS returns those
override values to callers of `ecs:DescribeTasks`. This exposes runtime bridge
credentials and user-supplied credentials to every IAM principal that can
describe the task.

The Trace server deliberately builds this dynamic object in
`apps/server/src/lib/runtime-adapters.ts`. It contains the session-scoped bridge
token plus user API credentials such as provider keys, GitHub credentials, SSH
keys, and Codex credentials. The production `RunTask` launcher is deployed
outside this repository, so the remediation belongs there.

## Immediate incident response

### Temporary production mitigation

The production launcher originally rejected a combined `bootstrapEnv` larger
than 6,000 bytes. On 2026-08-02, its deployed limit was raised to 32,768 bytes
to allow a Codex session credential and an SSH private key to coexist. This is
an operational mitigation only: the launcher source is maintained outside this
repository, so the corresponding source change must be made there before the
next infrastructure deployment.

1. Rotate every credential present in the task overrides observed during the
   investigation: provider API keys, GitHub token, SSH key, and Codex session
   credential. Revoke the old values first where the provider supports it.
2. Find all IAM principals with `ecs:DescribeTasks` against the runtime cluster
   and task resources. Restrict that permission to the launcher/control-plane
   roles that require it.
3. Preserve CloudTrail and CloudWatch audit records for the relevant period.
   Treat the credentials as disclosed if any non-control-plane principal could
   call `DescribeTasks`.

Rotating credentials is necessary but does not fix the disclosure path.

## Recommended fix: per-runtime S3 environment files

Use an ECS `environmentFiles` override instead of inline `environment` values.
The launcher already receives `bootstrapEnv`; it should serialize that object as
a dotenv file, upload it to a unique S3 key, then launch the task with only the
environment-file S3 ARN. `DescribeTasks` will disclose the ARN but not the
credential values.

This is a better fit than Secrets Manager for the current design because every
runtime has unique, short-lived values (`TRACE_RUNTIME_TOKEN`) and may have
user-specific credentials. ECS cannot override a task definition's `secrets`
array per `RunTask` request, so a static task definition cannot point at a
different per-runtime secret without registering a new task-definition revision
for each launch.

### Launcher changes

1. Add configuration for a dedicated private bucket, KMS key, and key prefix,
   e.g. `s3://trace-prod-runtime-bootstrap/runtime/<runtime-instance-id>.env`.
2. On `POST /trace/start-session`:
   - Validate `bootstrapEnv` as it does today.
   - Serialize key/value pairs as dotenv, escaping newlines and quotes correctly.
   - Upload using `PutObject` with SSE-KMS, bucket owner enforced, no ACL, and
     tags containing only non-secret identifiers (runtime ID and expiry).
   - Call `RunTask` with:

     ```ts
     overrides: {
       containerOverrides: [{
         name: "runtime",
         environmentFiles: [{
           type: "s3",
           value: `arn:aws:s3:::${bucket}/${key}`,
         }],
       }],
     }
     ```

   - Do not include any `bootstrapEnv` entry in `environment`.
3. Store the object key alongside the task ARN/runtime ID in the launcher's
   idempotency record so duplicate start requests reuse the same object/task.
4. Delete the object after the task is stopped, and run a lifecycle sweep that
   removes expired objects. Use an S3 lifecycle rule as a backstop (24 hours or
   less).
5. Do not log the dotenv body, request body, or `bootstrapEnv` object.

### IAM and infrastructure

- The launcher role needs `s3:PutObject`, `s3:DeleteObject`, and optionally
  `s3:GetObject` only under the dedicated prefix, plus KMS encrypt/decrypt for
  the dedicated key.
- The ECS **task execution role** needs `s3:GetObject` and KMS decrypt under
  that prefix. The application task role does not need S3 access.
- Bucket policy must deny non-TLS access, deny access outside the intended
  launcher/execution roles, require the intended KMS key, and block public
  access.
- The task definition must retain an `awslogs` log configuration and must not
  log environment contents during bootstrap.

## Required tests

1. A start request with `TRACE_RUNTIME_TOKEN`, `GITHUB_TOKEN`, `SSH_PRIVATE_KEY`,
   and provider credentials produces one S3 env file and a `RunTask` request
   containing no inline secret values.
2. The `RunTask` request includes the expected `environmentFiles` ARN.
3. Retrying an idempotent start neither creates a second file nor changes its
   contents.
4. Stop and cleanup delete the matching object; lifecycle expiry removes orphan
   objects.
5. The launcher never emits secret values in structured logs or errors.
6. An integration test starts a runtime and confirms the bridge still connects.

## Acceptance criteria

- `aws ecs describe-tasks` for a runtime task contains no secret values in
  `overrides`, tags, task definition, or container command.
- The runtime still receives all bootstrap variables and connects normally.
- The bootstrap object is encrypted at rest, inaccessible to the application
  process except through ECS task startup, and deleted promptly after use.
- The old exposed credentials have been rotated and the launcher IAM policy has
  been narrowed.

## Future hardening

The runtime token is intentionally short-lived, but it is still a credential and
must use the same protected delivery path. Long-term, consider replacing user
credentials in bootstrap env with narrowly scoped, expiring credentials or a
runtime-side broker. That is a separate design project; do not delay the S3
environment-file change on it.
