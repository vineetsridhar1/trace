# Session Brief: Audit Existing Repo Configuration, Local Mode, and Pairing

## Assignment

Determine whether Trace already achieves the useful outcomes behind three Paseo features:
declarative repository automation, local-first operation, and secure remote pairing. Produce an
evidence-backed audit, implement only small clearly required gaps, and document deliberate
architectural differences. Do not rebuild Paseo's local daemon or encrypted relay.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Why these are grouped

The expected result for all three may be “Trace already has this in a Trace-native form.” They need
verification against explicit user outcomes, security properties, and tests—not three speculative
rewrites. If the audit discovers a large missing product capability, document and split it into a
new implementation brief rather than silently expanding this session.

## Capability A: Declarative repository automation

### Current evidence to verify

- `Repo.applicationConfig` includes setup scripts, run scripts, applications, processes, secret
  references, ports, forwarding defaults, and health paths in `packages/gql/src/schema.graphql`.
- `apps/server/src/services/repo-application-config.ts` validates/normalizes this structure.
- `apps/server/src/services/session-applications.ts` runs configured setup and managed processes.
- Repository settings UI edits this configuration.

### Questions to answer

- Can a repo owner define setup/run/process behavior once and have every eligible session use it?
- Are configuration changes authorized, validated, evented, and consistently visible to clients?
- Are secrets referenced by name rather than embedded in configuration or events?
- Is server-stored configuration sufficient for the product, or is a version-controlled file such as
  `.trace/project.json` actually needed for portability/review/bootstrap?
- If a checked-in file is needed, define precedence, trust/approval, schema versioning, import/update,
  and command execution security before implementing it. Never auto-execute newly pulled commands
  merely because they exist in a repository.

## Capability B: Local-first operation

### Current evidence to verify

- Trace Desktop connects a local runtime bridge to the server and can host sessions/worktrees/
  terminals locally.
- Agent environments model local runtimes and runtime selection.
- Mobile can connect in a `paired_local` mode, with cloud-session limitations.

### Questions to answer

- Which workflows work with code/runtime local but central Trace services online?
- What happens when the central server, internet, desktop bridge, or web renderer is offline?
- Does “local mode” mean local execution, a locally hosted full Trace server, or fully offline use?
- Are reconnect, queued user actions, event reconciliation, and status copy accurate?

Do not declare Trace “offline-first” unless tests prove the relevant workflows. A valid audit may
conclude that Trace is central-server-first with local execution, which is an intentional model.

## Capability C: Secure device pairing

### Current evidence to verify

- `apps/server/src/services/mobile-auth.ts` implements expiring single-use pairing tokens and opaque
  random device secrets hashed at rest, with last-seen, expiry, listing, and revocation.
- `/auth/mobile/*`, bearer auth, and mobile `paired_local` connection paths use those credentials.

### Questions to answer

- Are pairing codes single-use, short-lived, and protected against brute force/replay?
- Are device secrets high entropy, hashed at rest, safely stored on clients, scoped to the user, and
  immediately revocable?
- Is every paired-local HTTP/WebSocket endpoint transported over an authenticated encrypted channel?
- Do UI and logs avoid leaking server URLs containing secrets, tokens, or pairing codes?
- Does logout/revocation terminate or promptly invalidate GraphQL, subscription, terminal, upload,
  and bridge-relevant access?

Authentication pairing is not transport encryption. Paseo's E2E relay protects traffic through an
untrusted relay; Trace's central server/TLS architecture has a different trust model. Do not add an
E2E local relay unless a separate product requirement calls for untrusted relay infrastructure.

## Required deliverable

Create `docs/trace-capability-audit.md` (or an equally focused location) containing, for each
capability:

- intended user outcome and threat/trust model;
- exact implementation evidence with file references and tests;
- status: complete, partial, intentionally different, or missing;
- reproducible manual verification steps;
- gaps ranked as correctness/security, product clarity, or optional parity;
- recommendation: keep, make a small fix now, or create a separate implementation project.

Small changes are authorized only when they directly close a demonstrated gap and remain coherent in
one PR—for example missing validation, stale UI wording, transport enforcement, revocation handling,
or a focused regression test. A checked-in repo-config format, offline event store, local server
distribution, or new relay is not a “small fix”; write a separate brief instead.

## Completion criteria

- The audit answers all questions above with code/test evidence rather than assumptions.
- Repo automation is tested end to end from saved config through session setup/process execution,
  including secret redaction and unauthorized update rejection.
- Local-mode behavior is tested/documented for central-server loss, bridge loss, reconnect, and
  paired-local constraints; marketing/UI terminology matches the demonstrated behavior.
- Pairing tests cover expiry, single redemption, replay/brute-force resistance as implemented,
  hashing, client storage expectations, revocation, and authenticated encrypted transport.
- Any correctness/security gap that is small and unambiguous is fixed with regression coverage.
- Larger gaps have standalone follow-up briefs with goals, non-goals, architecture, and completion
  criteria; no speculative subsystem is implemented.
- Relevant tests and affected typechecks pass, and no current mobile/desktop flow regresses.

## Likely touchpoints

- `packages/gql/src/schema.graphql`
- `apps/server/src/services/repo-application-config.ts`
- `apps/server/src/services/session-applications.ts`
- repository application settings UI
- agent-environment/local runtime and desktop bridge code
- `apps/mobile/src/lib/connection-target.ts`
- `apps/server/src/services/mobile-auth.ts`
- `apps/server/src/routes/auth.ts`
- `apps/server/src/lib/auth.ts`
- deployment/local-mode documentation and transport configuration

The preferred outcome is clarity and proof. Do not force Paseo-shaped code into Trace when Trace's
central service, event log, and existing device model already satisfy the underlying need.
