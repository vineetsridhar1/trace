# Programmatic Session Management Scope

## Summary

Trace should support programmatic session management for API servers, webhooks, background jobs, and orchestrator agents.

The first use case is headless session creation: an external system should be able to create a Trace session with an initial prompt and have it run without a user clicking through the UI. The service boundary should not be limited to launching, though. The same surface should later support checking status, sending follow-up messages, terminating sessions, deleting sessions, and reading session events.

This should be implemented as a session management layer over the existing session domain service, not as a separate event writer or runtime path.

## Current State

Trace already has most of the lower-level pieces:

- `StartSessionInput` supports tool, model, reasoning effort, environment, hosting, runtime, repo, branch, channel, session group, source session, checkpoint restore, prompt, and interaction mode in `packages/gql/src/schema.graphql`.
- `startSession` in `apps/server/src/schema/session.ts` is already a thin resolver that delegates to `sessionService.start`.
- `SessionService.start` creates the session group, session, `session_started` event, optional pending run, and can kick off runtime provisioning.
- `SessionService.run`, `sendMessage`, `terminate`, `dismiss`, and `delete` already cover most of the future management operations.
- Provisioned agent environments already call an external launcher and pass the bootstrap values required for a headless runtime.
- The bridge/runtime path already handles workspace preparation, pending command replay, tool output, completion, and runtime lifecycle events.

The current gaps are at the API and product boundary:

- Existing auth accepts user session JWTs or paired mobile secrets, not durable user-owned session management tokens.
- Existing `ApiToken` rows store provider secrets like Anthropic, OpenAI, GitHub, and SSH keys. They should not be reused for Trace API access.
- `SessionService.start` accepts an actor type but still records the `session_started` event as `user` in the current implementation.
- Programmatic callers need idempotency so webhook retries do not create duplicate sessions or duplicate compute.
- There is no stable status/read surface designed for non-browser callers.

## Goals

- Add an org-scoped, machine-friendly session management API.
- Tie v1 programmatic API keys to a real user, and run sessions as that user.
- Let in-app orchestrator work inherit the currently logged-in user instead of using a separate API key.
- Make session creation idempotent for external events.
- Let orchestrator agents use the same service layer directly.
- Keep GraphQL resolvers thin and preserve the service-layer ownership model.
- Keep all state changes event-backed through existing session services.
- Support cloud/provisioned headless execution as the default path.
- Leave room for future status, message, terminate, delete, and event-read operations.

## Non-Goals

- Do not replace the existing `SessionService`.
- Do not let external callers create events directly.
- Do not add vendor-specific Sentry logic to the core session service.
- Do not require local desktop runtimes for headless execution.
- Do not build the full project orchestrator in this scope.
- Do not turn this into a generic workflow builder.
- Do not introduce service-account or ownerless sessions in v1.

## Proposed Boundary

Add a new `SessionManagementService` as a programmatic facade over existing services.

This service owns:

- token authorization and scope checks
- external source normalization
- idempotency
- input validation for programmatic callers
- consistent response shapes for API/tool callers
- auditing metadata

This service delegates to:

- `sessionService.start` for session creation
- `sessionService.run` when a newly created session needs an immediate run in an already-prepared workspace
- `sessionService.sendMessage` for follow-up messages
- `sessionService.terminate` or `sessionService.dismiss` for stopping work
- `sessionService.delete` for deletion
- existing session query/read paths for status and event reads

The existing `SessionService` remains the source of truth for business logic, event emission, runtime provisioning, and command delivery.

## Service Interface

Initial shape:

```ts
sessionManagementService.createSession(input, actor)
sessionManagementService.getSessionStatus(input, actor)
sessionManagementService.listSessionEvents(input, actor)
sessionManagementService.sendMessage(input, actor)
sessionManagementService.terminateSession(input, actor)
sessionManagementService.deleteSession(input, actor)
```

`createSession` should be able to create:

- a new session group and session
- a new session inside an existing session group
- a read-only ask-mode triage session
- a cloud/provisioned session with an initial prompt
- a deferred session only when explicitly requested

For programmatic callers, the default should be to run when a prompt is supplied. If the existing lower-level start path only creates a session because the workspace already exists, the management service should follow with `run` so callers get the behavior they asked for.

## HTTP API Shape

Add a REST API optimized for non-browser callers:

```http
POST   /api/sessions
GET    /api/sessions/:id
GET    /api/sessions/:id/events
POST   /api/sessions/:id/messages
POST   /api/sessions/:id/terminate
DELETE /api/sessions/:id
```

GraphQL can continue serving the product UI. Orchestrator agents should call the service layer directly instead of going through GraphQL.

### Create Session

```json
{
  "source": "sentry",
  "externalId": "event-123",
  "channelId": "channel-1",
  "repoId": "repo-1",
  "environmentId": "env-1",
  "tool": "claude_code",
  "model": "claude-sonnet-4-6",
  "reasoningEffort": null,
  "branch": "main",
  "prompt": "Investigate this exception and propose a fix...",
  "interactionMode": "ask",
  "autoRun": true
}
```

Response:

```json
{
  "sessionId": "session-1",
  "sessionGroupId": "group-1",
  "status": {
    "agentStatus": "active",
    "sessionStatus": "in_progress",
    "connectionState": "connecting"
  },
  "duplicate": false
}
```

### Get Session Status

```json
{
  "sessionId": "session-1",
  "sessionGroupId": "group-1",
  "agentStatus": "active",
  "sessionStatus": "in_progress",
  "tool": "claude_code",
  "model": "claude-sonnet-4-6",
  "runtime": {
    "state": "connected",
    "runtimeInstanceId": "runtime-1",
    "runtimeLabel": "Cloud runtime"
  },
  "latestEventTimestamp": "2026-05-12T12:00:00.000Z",
  "workdir": "/workspace/trace-abc",
  "prUrl": null
}
```

### Send Message

```json
{
  "text": "Now produce a patch for the root cause.",
  "interactionMode": null,
  "clientMutationId": "optional-dedupe-key"
}
```

## Auth Model

V1 should use user-owned session management tokens.

There are two authentication paths:

1. External programmatic callers use a session management token.
2. In-app orchestrator flows use the existing logged-in user session.

Both paths resolve to a concrete `userId`. Sessions created through either path are owned by that user:

- `Session.createdById = resolved user id`
- lifecycle events use `actorType: "user"`
- lifecycle events use `actorId = resolved user id`
- source metadata distinguishes whether the work came from the API, Sentry, or an orchestrator

Suggested model:

```prisma
model SessionManagementToken {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  name           String
  tokenHash      String   @unique
  scopes         String[]
  constraints    Json     @default("{}")
  lastUsedAt     DateTime?
  expiresAt      DateTime?
  revokedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

The token should be invalid if:

- it is revoked
- it is expired
- the user no longer belongs to the organization
- the user's current organization role is insufficient for the requested operation
- the token does not include the required scope
- the requested repo/channel/environment violates token constraints

Scopes:

- `sessions:create`
- `sessions:read`
- `sessions:message`
- `sessions:terminate`
- `sessions:delete`

Constraints can restrict access to:

- specific repos
- specific channels
- specific agent environments
- specific sources

This deliberately avoids service-account ownership in v1. A programmatic session created by a user's token is a user-owned session with programmatic source metadata.

### External Programmatic Auth

External callers pass a token:

```http
Authorization: Bearer trace_sm_...
```

The server resolves that token into:

```ts
{
  authKind: "session_management_token",
  tokenId: "token-1",
  userId: "user-1",
  organizationId: "org-1",
  scopes: ["sessions:create", "sessions:read"],
  clientSource: "session_management_api"
}
```

The management service then calls lower-level session services with:

```ts
{
  createdById: "user-1",
  actorType: "user",
  clientSource: "session_management_api"
}
```

If the source is Sentry, the request should still act as the token user, with metadata like:

```json
{
  "managementSource": "sentry",
  "externalId": "event-123"
}
```

### In-App Orchestrator Auth

An orchestrator started from the app should not use a session management token.

It should use the existing app authentication context:

```ts
{
  authKind: "interactive_user",
  userId: ctx.userId,
  organizationId: ctx.organizationId,
  clientSource: "orchestrator"
}
```

If the orchestrator continues asynchronously after the initial browser request, its durable run record should store the delegated user:

```ts
{
  delegatedByUserId: ctx.userId,
  organizationId: ctx.organizationId,
  startedFrom: "web"
}
```

Each background step should re-check that the delegated user still belongs to the organization before creating sessions or sending messages. The session should still be created with `createdById = delegatedByUserId` and `actorType = "user"` in v1.

## Idempotency

Add an external reference table:

```prisma
model SessionExternalRef {
  id             String   @id @default(uuid())
  organizationId String
  source         String
  externalId     String
  requestHash    String
  sessionId      String
  tokenId        String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, source, externalId])
  @@index([sessionId])
}
```

Behavior:

- If `source` and `externalId` are new, create the session and store the mapping.
- If they already exist with the same request hash, return the existing session with `duplicate: true`.
- If they already exist with a different request hash, return a conflict rather than silently creating another session.
- If a session was created but runtime startup failed, retries should return the existing session status rather than launch duplicate compute.

## Runtime Policy

Programmatic sessions should prefer provisioned/cloud environments.

Rules:

- `deferRuntimeSelection` should default to false for programmatic calls.
- A create request with a prompt should require either an explicit `environmentId` or an org default environment that can run the requested tool.
- Local runtimes are allowed only when the token user or delegated app user has access to the selected bridge runtime and the runtime is connected.
- `interactionMode: "ask"` should create a read-only workspace where possible, which is useful for triage/investigation sessions.
- Cloud sessions still require repos to have remote URLs.

## Event and Audit Semantics

The management service should not create session lifecycle events directly. It should delegate to lower-level services that already emit:

- `session_started`
- `message_sent`
- `session_resumed`
- `session_terminated`
- `session_deleted`
- runtime lifecycle events
- `session_output`

Needed adjustment:

- `SessionService.start` should consistently use the authenticated actor when emitting `session_started`.
- For v1 programmatic tokens, that actor is the user who owns the token.
- For v1 in-app orchestrator runs, that actor is the logged-in user who delegated the run.

Useful payload additions:

- `clientSource: "session_management_api"` or a source-specific value
- `managementSource`, such as `sentry`, `orchestrator`, or `api`
- `externalId` when available
- `sessionManagementTokenId` in internal audit metadata only, not public event payloads

These should stay on the existing event path. Public payloads should include source context; sensitive token identifiers should stay in internal audit records or server logs.

## Sentry Integration

Sentry should be an adapter on top of `SessionManagementService`, not a special case inside the session service.

Flow:

1. Sentry route verifies signature.
2. Route resolves organization, repo, channel, and environment from configuration.
3. Route builds a prompt from exception details, stack trace, suspect commit, release, environment, and URL.
4. Route calls `sessionManagementService.createSession`.
5. Route returns the session IDs and duplicate status.

Future Sentry-specific configuration can live in an integration table or org settings:

- Sentry project slug
- Trace repo/channel mapping
- default environment
- default interaction mode
- prompt template
- enable/disable flag

## Orchestrator Integration

An orchestrator agent should call `SessionManagementService` directly, but the authentication source depends on where orchestration starts.

If orchestration starts from the frontend:

- the GraphQL/API entry point uses the logged-in user's existing session
- the orchestrator run stores `delegatedByUserId`
- sessions created by the orchestrator use `createdById = delegatedByUserId`
- events use `actorType: "user"` and `actorId = delegatedByUserId`
- event payloads include `managementSource: "orchestrator"`

If orchestration starts from an external API:

- the API request uses a user-owned session management token
- sessions created by the orchestrator use the token owner's user id
- event payloads include the external `source` and `externalId` when present

Examples:

- start a worker session for a ticket
- check whether a worker is done
- send a follow-up prompt
- terminate a stuck worker
- delete or archive abandoned sessions

This keeps orchestration durable service-layer state and avoids forcing agents through GraphQL.

Future service-account or bot ownership can be added later if needed, but v1 should keep ownership tied to a user to avoid changing `Session.createdById`, GraphQL `createdBy`, runtime access assumptions, and user-scoped secret lookup.

## Delivery Plan

### Phase 1: Session Management Foundation

- Add user-owned session management token model and hashing helpers.
- Add auth resolution for bearer session-management tokens.
- Add `SessionManagementService` skeleton.
- Add scope checks and constraints.
- Fix `session_started` actor attribution.

### Phase 2: Create and Idempotency

- Add `SessionExternalRef`.
- Implement `createSession`.
- Add `POST /api/sessions`.
- Ensure prompt-supplied creates run immediately when appropriate.
- Add duplicate retry behavior.

### Phase 3: Status and Events

- Implement `getSessionStatus`.
- Implement `listSessionEvents`.
- Add `GET /api/sessions/:id`.
- Add `GET /api/sessions/:id/events`.

### Phase 4: Message and Stop Controls

- Implement `sendMessage`.
- Implement `terminateSession`.
- Add message and terminate endpoints.
- Add delete only if the permission model is clear enough.

### Phase 5: Sentry Adapter

- Add Sentry webhook route and signature verification.
- Add mapping configuration.
- Build prompt template and call the management service.
- Add retry/idempotency tests.

## Testing Strategy

Service tests:

- token auth resolves org, user, scopes, and constraints
- token auth rejects users who lost org access
- in-app orchestrator auth uses the logged-in user without requiring a token
- create session with explicit provisioned environment
- create session duplicate returns the existing session
- conflicting duplicate returns an error
- prompt-supplied create runs immediately when workspace already exists
- forbidden repo/channel/environment is rejected
- actor type is preserved on events

Route tests:

- bearer token required
- missing scope rejected
- create session returns IDs and status
- status endpoint returns normalized session state
- message endpoint delegates to `sendMessage`
- terminate endpoint delegates to `terminate`

Runtime tests:

- provisioned launch still receives the existing runtime start payload
- duplicate webhook retry does not call the launcher twice
- local runtime path rejects inaccessible bridges

Sentry tests:

- invalid signature rejected
- valid event maps to expected session create input
- duplicate event returns existing session
- unmapped project returns a clear ignored response

## Open Questions

- Should status reads expose raw events, normalized events, or both?
- Should delete be part of v1, or should v1 only support terminate/dismiss?
- Should integration mappings live in org settings first, or get a dedicated table immediately?
- Should `source` and `externalId` be accepted for all management calls or only create?
- Should programmatic sessions default to `interactionMode: "ask"` for external incident triggers?
- Should orchestrator-created events eventually use `actorType: "agent"` plus `delegatedByUserId`, or should they remain user-authored with `managementSource: "orchestrator"`?

## Success Criteria

- A server-side caller can create a Trace session with a prompt using a durable token.
- A session management token is tied to a user and cannot act after that user loses org access.
- A frontend-started orchestrator can create sessions under the logged-in user's identity without minting an API key.
- The session runs on a provisioned environment without browser interaction.
- Repeating the same external event does not create duplicate sessions or compute.
- The caller can poll status and fetch recent events.
- The caller can send a follow-up message.
- The caller can terminate the session.
- Session events show the correct actor and source metadata.
- The implementation preserves the existing service-layer and event-store architecture.
