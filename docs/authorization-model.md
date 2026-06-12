# Authorization Model

How Trace decides **who is allowed to do what** — with a focus on the dangerous
operations: sending a message into a session, attaching to a session's terminal,
and starting/controlling a session on a bridge.

Every line below is backed by a `file:line` reference so you can audit the claim
against the code.

---

## The three layers

Every request passes through up to three gates, in order. A request must clear
**all** applicable gates; failing any one stops it.

| Layer | Question | Where it runs | Failure |
|-------|----------|---------------|---------|
| **1. Authentication** | Who are you? | `buildContext` / `buildWsContext` (`lib/auth.ts`) | `Not authenticated` |
| **2. Org membership** | Are you allowed on this server at all? | `assertOrgMembership` (`lib/org-access-guard.ts`) | `Organization membership required` |
| **3. Resource authorization** | Can you touch *this specific* session / terminal / bridge? | per-operation checks (below) | `Not authorized…` / `Access denied` |

### Layer 1 — Authentication

The caller presents a token: the `trace_token` cookie or an `Authorization:
Bearer` header (web/desktop), or a mobile device secret (mobile). It is verified
in `authenticateAccessToken` (`lib/auth.ts:197`), which checks the JWT signature
against `JWT_SECRET` (`lib/auth.ts:57`) and yields a trusted `userId`. An invalid
token throws before anything else runs (`lib/auth.ts:300`).

> **Trust anchor:** `ctx.userId` and `ctx.organizationId` come from a
> server-signed JWT. A client cannot forge them without `JWT_SECRET`. Every
> authorization decision below builds on this.

### Layer 2 — Org membership

Enforced for **every GraphQL operation** at context-construction time, before
any resolver runs:

```ts
// lib/org-access-guard.ts
export function assertOrgMembership(organizationId: string | null): void {
  if (!organizationId) {
    throw new AuthorizationError("Organization membership required");
  }
}
```

`organizationId` is only set after the user's `OrgMember` row is resolved
(`lib/auth.ts:338`, `:346`), so a non-empty value *is* proof of membership.
Called from both entry points:

- HTTP queries/mutations — `lib/auth.ts` (end of `buildContext`)
- WebSocket subscriptions — `lib/auth.ts` (end of `buildWsContext`)

This server is single-tenant, so Layer 2 is effectively an **allowlist of users
who may use the API at all**. Authentication (REST `/auth/*`) is deliberately
*not* behind this gate, so login and `/auth/me` keep working; the gate bites the
first time a non-member issues a GraphQL call.

Membership is granted on login: members of the configured GitHub org
(`AUTO_JOIN_GITHUB_ORG`, default `opendoor-labs`) are auto-added to the
organization by `autoJoinOrganizationIfMember` (`routes/auth.ts:297`), which
verifies membership via `isGitHubOrgMember` (`lib/github-org.ts:18`). A GitHub
user who is *not* in that org logs in successfully but receives no `OrgMember`
row, so Layer 2 blocks them on every GraphQL call — the intended posture.

### Layer 3 — Resource authorization

The interesting layer. The helpers live in `services/access.ts` and
`services/runtime-access.ts`. The model has three ideas:

- **Org scoping** — every resource lookup is filtered by the caller's org, so a
  resource from another org simply "does not exist" to you.
- **Session-group visibility** — within an org, a session can be hidden by
  placing it in a *private* session group. `canViewSessionGroup`
  (`services/access.ts:62`) returns true only when the group is public/unset
  **or** the caller owns it:

  ```ts
  return group.visibility == null
    || group.visibility === "public"
    || group.ownerUserId === userId;
  ```

- **Bridge access (ownership & grants)** — a *local* bridge is a specific user's
  machine. It is owned by one user, and acting on a session that lives on it
  requires being that owner or holding an explicit grant (see next section).
  This is enforced **independently** of session-group visibility.

> **Important design note (read this before launch):** within a single org there
> is **no per-session participant ACL** at the *visibility* layer. Any org member
> may act on any session that is *not* inside a private session group — **but** if
> that session runs on a local bridge, the bridge-access check below still applies
> and blocks non-owners. Per-user isolation of *cloud* sessions is achieved by
> putting work in a **private session group** owned by that user. Terminals are
> stricter still — owner-only.

### Bridge access: ownership & grants (within-org)

This is the layer that answers *"can an org member act on a bridge they don't
own?"* — the answer is **no**, unless granted.

- Each local bridge (`BridgeRuntime`) has a single `ownerUserId`.
  `runtimeAccessService.getAccessState` (`runtime-access.ts:397`) resolves a
  caller's rights:
  - **Owner** → full capabilities `["session", "terminal"]` (`:467`).
  - **Non-owner** → `allowed` only if an active `BridgeAccessGrant` exists
    (`:485`–`:499`); otherwise denied.
- `assertAccess` (`runtime-access.ts:503`) enforces it and throws
  `"Access denied: you do not have permission to use this local bridge"`
  (`:10`). It applies **only to local bridges** — cloud runtimes return early
  (`:520`), since they aren't anyone's personal machine.
- Grants are **scoped and time-boxed**: a `BridgeAccessGrant` carries
  `capabilities` (`session` / `terminal`), a `scopeType` (`all_sessions` or a
  specific `session_group`), and an optional `expiresAt`. A non-owner obtains one
  via the request/approve flow: `requestAccess` (`runtime-access.ts:587`) →
  owner `approveRequest` (`:751`); the owner can `revokeGrant` (`:950`).

---

## Dangerous operation 1 — Sending a message into a session

**Request:** `sendSessionMessage(sessionId, text)` (GraphQL mutation).

**Resolver guard** (`schema/session.ts:411`):

```ts
await assertScopeAccess("session", args.sessionId, ctx.userId, requireOrgContext(ctx));
```

`assertScopeAccess` → `assertSessionAccess` (`services/access.ts:86`) runs two
checks:

1. **Org scope** — `prisma.session.findFirst({ where: { id, organizationId } })`
   (`access.ts:91`). A session in another org returns `null` →
   `Not authorized for this scope`.
2. **Private-group visibility** — if the session is in a session group, the
   caller must pass `canViewSessionGroup` (`access.ts:107`), else
   `Not authorized for this scope`.

Then, before the message is dispatched, the **service** resolves the target
runtime through `resolveAccessibleLocalRuntimeBinding` (`services/session.ts:5237`).
For a local-bridge session this calls `assertRuntimeAccess`
(`services/session.ts:1982`) → bridge-access check. So even a same-org member
who can *see* the session cannot push a message to it if it runs on a bridge
they don't own (and weren't granted) — they get
`"Access denied: you do not have permission to use this local bridge"`.

**What stops the attack**

- *User in another org* → session invisible (org filter) → rejected.
- *User in same org, target is in someone else's private group* → visibility
  check fails → rejected.
- *User in same org, session runs on a bridge they don't own* → bridge-access
  check fails at dispatch → rejected.
- *User with no org* → blocked earlier at Layer 2.

---

## Dangerous operation 2 — Running a session

**Request:** `runSession(id, prompt)` (GraphQL mutation).

The resolver passes an `access` object to the service
(`schema/session.ts:319`), and the **service** enforces authorization
(`services/session.ts:3948`):

```ts
if (session.organizationId !== access.organizationId) {
  throw new AuthorizationError("Not authorized for this session");
}
if (session.sessionGroup && !canViewSessionGroup(session.sessionGroup, access.userId)) {
  throw new AuthorizationError("Not authorized for this session");
}
```

Same two-part guarantee as messaging (org match + private-group visibility),
enforced in the service layer so it also protects non-GraphQL callers (e.g. the
agent runtime). And as with messaging, the run is dispatched through
`resolveAccessibleLocalRuntimeBinding` → `assertRuntimeAccess`
(`services/session.ts:3967` → `:1982`), so running a session on a local bridge
you don't own is rejected with the bridge-access error even if you can see the
session.

---

## Dangerous operation 3 — Attaching to a session's terminal

**Request:** WebSocket to `/terminal`, then a JSON `auth` message, then an
`attach` message with a `terminalId`.

This is the most sensitive path (a terminal is a live shell), and it has the
**strictest** check — *owner-only*, not just org-level.

### Step A — Connection upgrade
The `/terminal` upgrade itself is **open** (no token at the HTTP upgrade), except
for a CORS origin rejection on credentialed browser upgrades
(`index.ts:400`, `:458`). No terminal data flows before authentication — the
socket is useless until the caller authenticates.

### Step B — Authenticate the socket
The client must send `{ type: "auth", token }`. The token is validated by
`authenticateAccessToken` → `userId`. If it doesn't arrive within 5 seconds, the
socket is killed with `Unauthorized` (`lib/terminal-handler.ts`, auth timeout).

### Step C — Authorize the attach
On `{ type: "attach", terminalId }`, three checks run
(`lib/terminal-handler.ts:242`–`291`):

1. **Owner-only** (`:246`):
   ```ts
   if (authContext.ownerUserId !== userId) { /* "Access denied" */ }
   ```
   `ownerUserId` is pinned when the terminal is created, to the `userId` of the
   GraphQL caller who created it. Terminal IDs are random UUIDs, so they can't be
   guessed — and even with the ID, only the creator attaches.
2. **Org membership** (`:259`) — the session must belong to an org the user is a
   member of (`organization: { orgMembers: { some: { userId } } }`).
3. **Bridge capability** (`:277`) — `runtimeAccessService.assertAccess({ …,
   capability: "terminal" })`. For a **local** bridge this requires the user to
   be the bridge owner or hold an active access grant (`runtime-access.ts:503`,
   `:467`, `:485`); otherwise `AuthorizationError`.

These same checks are **re-run on every keystroke/resize**
(`assertCurrentTerminalAccess`), so access revoked mid-session takes effect
immediately.

**What stops the attack:** even another member of the same org cannot attach to
your terminal — the owner check (1) blocks them outright, before org or bridge
checks even matter.

---

## Dangerous operation 4 — Starting / controlling a session on a bridge

A "bridge" is the WebSocket (`/bridge`) that a local/desktop machine (or a cloud
runtime) opens to run sessions. The risk: user A driving a session on user B's
machine.

### Step A — Upgrade requires a scoped token
Unlike `/terminal`, the `/bridge` upgrade **requires a valid token** up front
(`index.ts:412`–`457`). Two kinds, both signed JWTs:

| Token | Minted by | Embeds | Verified by |
|-------|-----------|--------|-------------|
| `bridge_auth` (local) | `GET /auth/bridge-token` | `userId`, `organizationId`, `instanceId` | `verifyBridgeAuthToken` (`auth.ts:230`) |
| `provisioned_runtime` (cloud) | session provisioning | `instanceId`, `org`, `user`, `sessionId`, scope | `authenticateProvisionedRuntimeToken` (`runtime-adapters.ts:75`) |

No valid token → `401 Unauthorized` (`index.ts:449`). Bridge tokens are
short-lived (5-minute TTL, `auth.ts:32`).

### Step B — Minting a bridge token is gated
`GET /auth/bridge-token` (`routes/auth.ts:832`) requires an authenticated user
**and** verifies org membership before issuing
(`routes/auth.ts:853`):

```ts
const membership = await prisma.orgMember.findUnique({
  where: { userId_organizationId: { userId, organizationId } },
});
if (!membership) return res.status(403).json({ error: "Not a member of this organization" });
```

### Step C — instanceId must match, and ownership is pinned
When the bridge announces itself (`runtime_hello`), the declared `instanceId`
must equal the one inside the token, or the socket is closed with
`Bridge auth mismatch` (`lib/bridge-handler.ts`). Then registration binds the
instance to its owner and **refuses to let a second user claim it**
(`services/runtime-access.ts:262`):

```ts
if (existing && existing.ownerUserId !== params.ownerUserId) {
  throw new AuthorizationError(
    "This bridge instance is already registered to another user in this organization",
  );
}
```

### Step D — Every bridge action is scoped to *this* connection
Session messages over the bridge are only accepted for sessions bound to this
exact runtime + org (`resolveSessionBoundToThisRuntime`,
`lib/bridge-handler.ts`), and all runtime-driven mutations pass
`bridgeAuth.organizationId` into the service layer.

**What stops the attack**

- *No token / expired token* → upgrade rejected (Step A).
- *Token for an org you're not in* → can't be minted (Step B).
- *Trying to impersonate someone's bridge instance* → ownership conflict on
  registration (Step C).
- *Trying to drive a session not bound to your runtime* → ignored (Step D).

---

## Summary table

| Operation | Layer 1 (authn) | Layer 2 (org) | Layer 3 (resource) | Strictness |
|-----------|:---:|:---:|---|---|
| Send session message | ✓ | ✓ | org scope + private-group visibility (`access.ts:86`) + **bridge access on dispatch** (`session.ts:5237`→`:1982`) | org-wide for cloud; bridge-owner/grant for local |
| Run session | ✓ | ✓ | org match + visibility (`session.ts:3948`) + **bridge access on dispatch** (`session.ts:3967`→`:1982`) | org-wide for cloud; bridge-owner/grant for local |
| Attach to terminal | ✓ (post-connect) | ✓ | **owner-only** + org + bridge capability (`terminal-handler.ts:246`) | creator-only |
| Start/control on bridge | ✓ (scoped JWT) | ✓ (at mint) | instanceId match + owner pinning + per-connection scope (`bridge-handler.ts`, `runtime-access.ts:262`) | bridge-owner-only |

---

## Known assumptions & deliberate gaps

Be explicit about these before launch:

1. **Org members are trusted at the *visibility* layer, not the bridge layer.**
   There is no per-session participant list, so any org member can see/message/run
   any *cloud* session that isn't in a **private session group**. However,
   sessions running on a **local bridge** are additionally gated by bridge
   ownership/grants, so a non-owner is blocked there regardless of group
   visibility. To make a *cloud* session private to one user, put it in a private
   group they own. Terminals are owner-only regardless.
2. **The `/terminal` upgrade is open; auth is enforced post-connect** (within
   5s, before any data flows). This is intentional but worth noting in a review.
3. **Access is gated on GitHub-org membership.** On login, members of
   `AUTO_JOIN_GITHUB_ORG` (default `opendoor-labs`) are auto-added to the org
   (`routes/auth.ts:297`); everyone else authenticates but is blocked at Layer 2
   on every GraphQL call. Auto-join fails *open* on errors — it never blocks
   login, the user just isn't added (and so stays blocked at Layer 2). Admins can
   also grant membership directly via `addMember`.
4. **Everything rests on `JWT_SECRET`.** If it leaks, an attacker can mint
   tokens for any user/org. Protect it accordingly.
