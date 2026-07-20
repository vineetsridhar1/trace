# Custom Design Systems Plan

Status: implementation plan (2026-07-20).

This document defines how Trace creates, stores, versions, selects, and consumes custom
design systems. It extends the shipped Design-session architecture in
`docs/design-sessions-v1.md`; where older planning documents describe a bare
`SessionGroup.designSystemId`, this document supersedes that with an immutable
`designSystemVersionId` reference.

## Goal

Let a user derive a reusable design system from an existing repository, store it safely
in Trace, and select it when creating a Design. A Design agent must be able to use the
selected tokens, components, fonts, assets, and brand guidance without receiving access
to the original repository.

## Success Criteria

- A user can create a design system from any repository they are authorized to use in
  Trace.
- An agent session inspects the source repository and produces a validated, portable
  design-system package.
- Trace stores every published package version as an immutable object through the
  existing storage adapter (S3 in production and local storage in development).
- A user can select a ready design-system version before creating a Design.
- The selected version is materialized in the isolated Design workspace before the
  workspace reports ready and before the first agent prompt runs.
- The Design agent can use the package without reading the source repository.
- Existing Designs remain pinned to their original package version when the design
  system is regenerated.
- Mutations go through the service layer and emit events containing enough data for
  Zustand to update without refetching.
- Corrupt, unsafe, incomplete, oversized, or inaccessible packages never become ready.
- Local development exercises the same service contract without requiring S3.

## Key Decisions

### The source repository is not runtime storage

The user's repository is an extraction input and provenance source. Trace may write an
inspectable package back to `.trace/design-systems/<slug>/` in that repository, but a
Design session never depends on being able to read it.

The durable runtime artifact is an immutable `DesignSystemVersion` archive owned by
Trace:

```text
User repository
    -> generation coding session
    -> portable package
    -> Trace validation
    -> immutable S3 object + DesignSystemVersion row
    -> materialized into isolated Design workspace
```

### Metadata is in Postgres; package bytes are in object storage

Postgres stores identity, status, permissions, provenance, version relationships, and
content digests. The existing `StorageAdapter` stores the package bytes. Production uses
S3; local mode uses the existing local adapter.

Do not store package files, fonts, images, or component source in JSON database columns.

### Designs pin versions

`SessionGroup` references `designSystemVersionId`, not merely `designSystemId`. Updating a
design system creates a new version. Existing Designs do not move automatically.

### Component portability is explicit

Arbitrary production React components cannot reliably run in the Design starter: they
may depend on application providers, aliases, generated clients, server APIs, or private
packages. The generated manifest classifies every discovered component:

- `portable`: executable source and required local assets are included in the package.
- `recipe`: structure, variants, states, class names, and token usage are captured so the
  Design agent can recreate it accurately.
- `reference`: useful source evidence exists, but the component cannot safely be moved.

The product only claims direct component reuse for `portable` entries.

### Use Open Design's package ideas, not its daemon

The package is centered on agent-readable guidance, compiled semantic tokens, component
inventory, previews, assets, and source evidence. Trace owns discovery, persistence,
permissions, generation sessions, events, and runtime delivery.

## Product Experience

### New Design

Selecting **New Design** opens a configuration step instead of immediately starting a
session:

```text
Create Design

Design system
[ Trace Default                                           v]
  - Trace Default
  - Acme Product UI                         v3 · web-platform
  - Acme Marketing                          v1 · marketing-site
  - Create new design system...

[Cancel]                                      [Create Design]
```

The selector shows non-archived systems with a published active version visible to the
active organization. A system remains selectable at its current active version while a
new version is generating. Each option shows the active version and source-repository
name when one exists. The last selected system may be suggested, but the persisted
organization default is a later feature.
After creation, the user enters the brief through the existing Design chat exactly as
they do today; adding a separate prompt field to this dialog is not required.

Choosing **Create new design system...** opens the creation flow without creating an
empty Design first.

### Create Design System

The first release asks for:

- name;
- source repository;
- source branch, defaulting to the repository default branch;
- optional source subdirectory for monorepos;
- generation environment when the normal session flow cannot select one automatically.

Submitting creates a draft design-system entity and a normal repo-linked coding session.
Trace routes the user to that session so they can see progress, answer agent questions,
and review source changes. The session uses a dedicated built-in generation skill and a
system instruction that limits the task to extracting the package.

When generation succeeds, the design system becomes `ready`. Returning to Create Design
automatically selects it. If the user leaves, it remains available in the organization's
Design Systems view.

### Manage and update

A Design Systems view lists:

- name and description;
- status;
- active version;
- source repository, path, branch, and source commit;
- generating session when active;
- creation and last-published times;
- preview, regenerate, archive, and version-history actions.

Regeneration starts a new repo-linked session and publishes a new immutable version. The
new version becomes active for future Designs only after successful validation. Existing
Designs may expose an explicit **Upgrade design system** action later; there is no silent
upgrade.

## Package Contract

The generated archive contains one top-level `design-system/` directory:

```text
design-system/
├── manifest.json
├── DESIGN.md
├── tokens.css
├── components.manifest.json
├── components/
│   ├── index.ts
│   └── ...portable component files
├── assets/
│   └── ...fonts, icons, logos, and images
├── preview/
│   ├── foundations.html
│   └── components.html
└── source/
    └── evidence.json
```

Required files for v1:

- `manifest.json`
- `DESIGN.md`
- `tokens.css`
- `components.manifest.json`
- `source/evidence.json`

Other directories are optional. Empty directories are omitted.

### Manifest

The manifest is the discovery and integrity contract:

```json
{
  "schemaVersion": "trace-design-system/v1",
  "id": "acme-product-ui",
  "name": "Acme Product UI",
  "description": "Acme's product interface language.",
  "platforms": ["web"],
  "files": {
    "guidance": "DESIGN.md",
    "tokens": "tokens.css",
    "components": "components.manifest.json",
    "evidence": "source/evidence.json"
  },
  "componentsDirectory": "components",
  "assetsDirectory": "assets",
  "previewDirectory": "preview"
}
```

Every declared path must be relative, normalized, inside the package root, and present.
Unknown top-level fields fail v1 validation so schema evolution remains deliberate.

### DESIGN.md

`DESIGN.md` is the agent-readable contract. It must cover:

- visual theme and product atmosphere;
- semantic color roles and contrast;
- typography and type scale;
- spacing, density, grids, and responsive behavior;
- component construction and state behavior;
- elevation and motion;
- imagery, iconography, and brand assets when applicable;
- accessibility requirements;
- concrete do/don't guidance;
- instructions for applying the system in a new design.

The generator must cite source files in `source/evidence.json`; it must not present guesses
as repository facts.

### Tokens

`tokens.css` is the executable source of truth for shared styling. It contains semantic
CSS custom properties rather than framework-specific configuration. Required v1 roles
cover backgrounds, surfaces, foreground tiers, borders, accent and on-accent colors,
semantic states, font stacks, core type sizes, spacing, radii, elevation, focus, and
motion.

The validator checks syntax, required roles, unresolved aliases, duplicate declarations,
and basic contrast pairs. A generated adapter may seed the Design starter's existing
`trace.tokens.json`, but that JSON is derived runtime compatibility data, not a second
canonical design-system source.

### Component manifest

Each component entry contains:

- stable name and category;
- `portable`, `recipe`, or `reference` reuse mode;
- original source paths and export names;
- portable package entry when available;
- variants, sizes, states, and relevant props;
- semantic token dependencies;
- asset dependencies;
- accessibility and interaction notes;
- evidence confidence and limitations.

Portable components must import only files inside the package and dependencies explicitly
supported by the Design starter. Validation rejects unresolved aliases, imports outside
the package, Node/server imports, network access, and undeclared assets.

### Source evidence

`source/evidence.json` records the source commit and the files used to derive each major
decision. This supports review and regeneration without making the source repo a runtime
dependency. It must not include secrets, environment files, complete unrelated source
files, or credentials.

## Data Model

Add Prisma enums generated into GraphQL through the normal schema/codegen path:

```text
DesignSystemStatus = draft | generating | ready | failed | archived
```

Add `DesignSystem`:

```text
id                         String @id
organizationId             String
name                       String
slug                       String
description                String?
status                     DesignSystemStatus
sourceRepoId               String?
sourceBranch               String?
sourcePath                 String?
activeVersionId            String?
generationSessionGroupId   String?
createdById                String
lastError                  String?
createdAt                  DateTime
updatedAt                  DateTime
archivedAt                 DateTime?
```

Constraints and indexes:

- unique `(organizationId, slug)`;
- index `(organizationId, status, updatedAt)`;
- index `sourceRepoId`;
- named relations for active version and generation session group;
- the source-repo relation uses `onDelete: SetNull`, while source name/URL/path/commit
  provenance remains preserved in each published version's manifest and evidence.

Add `DesignSystemVersion`:

```text
id                    String @id
designSystemId        String
version               Int
storageKey            String
contentDigest         String
byteSize              Int
sourceCommitSha       String?
generationSessionGroupId String?
sourceCheckpointId    String?
manifest              Json
validationSummary     Json
createdById           String
createdAt             DateTime
```

Constraints and indexes:

- unique `(designSystemId, version)`;
- unique `(designSystemId, contentDigest)` to make repeated publication idempotent;
- index `(designSystemId, createdAt)`;
- indexes for generation session group and source checkpoint provenance.

Add nullable `SessionGroup.designSystemVersionId`. Only `design` groups may set it in v1.
The relation uses `onDelete: Restrict`; a referenced version cannot be deleted.

Do not duplicate schema enums or GraphQL entity types in application code. Generate them
from `packages/gql/src/schema.graphql` and Prisma as appropriate.

## GraphQL Contract

Add query fields:

- `designSystems(organizationId: ID!, includeArchived: Boolean): [DesignSystem!]!`
- `designSystem(id: ID!): DesignSystem`
- `designSystemVersions(designSystemId: ID!): [DesignSystemVersion!]!`

Add mutations:

- `createDesignSystem(input: CreateDesignSystemInput!): DesignSystem!`
- `regenerateDesignSystem(id: ID!, input: RegenerateDesignSystemInput): DesignSystem!`
- `archiveDesignSystem(id: ID!): DesignSystem!`
- `retryDesignSystemPublication(id: ID!): DesignSystem!`

`CreateDesignSystemInput` contains `name`, `repoId`, optional `branch`, optional
`sourcePath`, and optional `environmentId`. Organization comes from the authenticated
request context. `RegenerateDesignSystemInput` may override branch, source path, or
environment while defaulting to the current source configuration.

Extend `StartSessionInput` with `designSystemVersionId: ID`. The returned mutation entity
is used only for navigation; Zustand receives shared state through organization events.

Resolvers validate input shape, call services, and format results. They contain no
generation, storage, authorization, or state-transition logic.

## Service Layer

Create `DesignSystemService` with these primary methods:

### `list`

- Authorize organization membership.
- Return visible systems and their active versions.
- Exclude archived systems by default.

### `create`

- Authorize access to the organization and source repository.
- Validate the requested branch/path and unique slug.
- Allocate the design-system id before session creation so the generation prompt and
  output path are deterministic.
- Call `SessionService.start` for a repo-linked coding session and use its existing
  `afterCreate({ tx, session, sessionGroup })` seam to create the design system, associate
  the generation group, set status to `generating`, and append deferred
  `design_system_created` plus `design_system_generation_started` events inside the same
  transaction as the session rows.
- Collect those deferred events in the coordinating service and publish them only after
  `SessionService.start` returns successfully. A failed session transaction therefore
  leaves no draft design system behind.

Do not place session creation logic in the resolver or open a nested transaction around
`SessionService.start`.

### `publishFromSession`

- Confirm the completing session group is the current generation session for the design
  system.
- Resolve the source commit/checkpoint.
- Allocate the next version id and an S3 key.
- Ask the owning bridge/runtime to package the configured source path and upload it to a
  signed target.
- Download through `StorageAdapter.getObject`, independently validate the archive and
  package, compute the digest server-side, and compare it with the bridge report.
- In one database transaction, create the version, set it active, mark the system ready,
  clear errors, and append full-entity events.
- Delete the uploaded object if validation or the transaction fails.
- Treat an existing `(designSystemId, contentDigest)` as idempotent success.
- Allocate the next version number under a transaction/unique-constraint retry so two
  completion signals cannot publish the same ordinal.

### `regenerate`

- Keep the current active version usable.
- Reject a second concurrent regeneration while the current generation session is
  active; retrying the same request returns the current generation association.
- Start a new generation session against the selected source ref.
- Set status to `generating` without clearing `activeVersionId`.
- A failed regeneration returns the system to `ready` with `lastError` when an older
  active version exists; it becomes `failed` only when it has never published a version.

### `archive`

- Mark the system archived and emit an event.
- Do not delete versions or package objects.
- Existing Designs continue to resolve pinned versions.

### Session creation integration

When `SessionService.start` receives `kind: design` and a version id:

- authorize the version through its organization-scoped design system;
- require the requested published version to exist and its parent system not to be
  archived; a parent currently generating a newer version remains selectable;
- persist `designSystemVersionId` on the new group;
- include the full selected-version reference in `session_started` payloads;
- reject design-system versions for non-design groups in v1.

Restoring or joining an existing group inherits its pinned version and does not reject it
merely because the parent system was later archived.

## Events and Client State

Add event types:

- `design_system_created`
- `design_system_generation_started`
- `design_system_generation_failed`
- `design_system_version_created`
- `design_system_updated`
- `design_system_archived`

Payloads for entity-changing events include the complete normalized `DesignSystem` and,
when relevant, complete `DesignSystemVersion`. The client handler upserts them into new
`designSystems` and `designSystemVersions` entity tables. Lists derive from those tables;
mutation results do not update shared state.

Generation output remains ordinary session output. Do not create a second progress-log
system. Design-system events record lifecycle transitions, while the linked session is
the detailed audit trail. Selecting a version for a new Design is recorded by the normal
`session_started` event and its complete session-group payload; it does not need a
duplicative design-system event.

## Generation Skill

Add a built-in `generate-design-system` skill to supported cloud agent images and keep
the Claude and Codex copies aligned. It is selected by the server-owned generation prompt
rather than requiring the user to install it in their repository.

The skill workflow is:

1. Read repository instructions and the requested source boundary.
2. Inventory framework, styling system, packages, aliases, and build tooling.
3. Locate existing tokens, global styles, Tailwind themes, Storybook stories, shared
   components, fonts, icons, logos, screenshots, and brand documents.
4. Identify representative components and states.
5. Produce source-backed `DESIGN.md` guidance.
6. Normalize semantic tokens into `tokens.css` while recording source mappings.
7. Produce the component manifest and portable components where safe.
8. Produce minimal foundation and component previews.
9. Write source evidence, excluding secrets and irrelevant files.
10. Run the package validator and repair failures.
11. Write `manifest.json` last, commit, and push through the normal session flow.

The system instruction must prohibit production application refactors. The only expected
repository changes are inside the configured design-system output directory unless the
user explicitly requests otherwise.

The skill must ask when it finds multiple unrelated design systems or cannot determine
the intended application/package. It should not ask about choices that can be safely
derived and recorded with evidence.

## Packaging and S3 Lifecycle

### Object key

Use a server-owned namespace separate from arbitrary uploads:

```text
design-systems/{organizationId}/{designSystemId}/{versionId}/package.tar.gz
```

The key is generated by the service and never accepted from a client or agent.

### Bridge packaging command

Extend the shared bridge protocol with a command and result, for example:

```text
package_design_system
design_system_package_result
```

The command carries:

- request id and session id;
- package path relative to the verified session workdir;
- signed upload target;
- maximum uncompressed bytes, archive bytes, and file count.

The bridge:

- resolves the package under the session workdir;
- rejects symlinks, sockets, devices, hard links, traversal, and files outside the root;
- applies limits while walking, not after loading everything;
- creates a deterministic archive with normalized paths and timestamps;
- computes SHA-256 over the uploaded bytes;
- uploads it and returns digest, byte size, and file count.

The server does not trust this result. It downloads and validates the object before
creating a version.

### Retention

- Published version objects are immutable.
- Failed staging objects are deleted best-effort.
- Archiving a design system does not delete objects.
- A future garbage collector may remove versions only when no `SessionGroup`, active
  version, retained event policy, or legal hold references them.
- Version deletion is not exposed in v1.

## Design Workspace Materialization

Extend `BridgePrepareAppCommand` for Design sessions with an optional package descriptor:

```text
designSystemPackage:
  versionId
  downloadUrl
  contentDigest
  byteSize
```

The server resolves a fresh signed URL immediately before sending `prepare_app`; URLs are
not persisted in session connection JSON or events.

For `sessionGroupKind: design`, the bridge performs this order:

1. Create or restore the normal Design workspace.
2. Download the selected archive with a strict response-size limit.
3. Verify byte size and SHA-256.
4. Validate archive entry paths and extract into a temporary sibling directory.
5. Validate the package manifest and required files.
6. Atomically replace `<workdir>/design-system` with the extracted directory.
7. Generate the temporary compatibility adapter for `trace.tokens.json` when required by
   the current starter.
8. Register the session and emit `workspace_ready`.

Any failure emits `workspace_failed`; the first agent prompt must never run with a missing
or partial selected system.

`design-system/` is runtime materialization, not agent-owned output. Add it to the Design
starter's `.gitignore` and rehydrate it on every provision or restore. The selected
version remains durable in S3 and on `SessionGroup`, so it does not need to be duplicated
in every managed Git repository.

The Trace Default option uses the same directory contract. It is bundled with the starter
or materialized as a built-in package so the agent never needs conditional instructions
for “custom” versus “default.”

## Design Agent Consumption

Update the Design session instruction and `docs/ai-guidance.md` to require this read
order before editing:

1. `design-system/manifest.json`
2. `design-system/DESIGN.md`
3. `design-system/tokens.css`
4. `design-system/components.manifest.json`
5. Relevant portable components, assets, or evidence on demand

The package's guidance and token values outrank the starter defaults. User instructions
for the specific Design may intentionally override them, but the agent must describe the
override rather than silently drifting.

The prompt includes only the selected system name, version, digest, and read contract.
Do not inject the entire package into every prompt; it is already present in the
workspace. This keeps prompt size bounded and lets the coding agent pull only relevant
component files.

The Design starter should expose a stable import seam for portable components and load
the materialized token stylesheet. During the compatibility phase, generated
`trace.tokens.json` seeds existing primitives. The target architecture removes duplicate
token values and has primitives consume semantic CSS properties directly.

## Authorization

- Every service lookup scopes by active organization.
- Creating or regenerating requires access to the source repository through the same
  authorization used by coding sessions.
- Listing and selecting require visibility of the organization-scoped design system, not
  continuing access to its original source repo.
- A Design may continue using its pinned version after source-repo access is revoked.
- Signed package URLs are short-lived and only sent to the runtime that owns the session.
- Storage keys never appear as unrestricted public URLs.
- Archiving requires the same elevated organization role used for comparable shared
  organization resources; use the existing role helper rather than bespoke checks.

## Validation and Security Limits

Initial configurable limits should default to:

- 25 MiB compressed archive;
- 75 MiB uncompressed content;
- 1,000 files;
- 5 MiB per ordinary file;
- larger per-file allowance only for declared fonts/images, still bounded;
- maximum path length and directory depth;
- UTF-8 validation for manifest, Markdown, JSON, CSS, and source components.

Reject:

- absolute or parent-traversing paths;
- duplicate normalized paths;
- symlinks, hard links, sockets, and device files;
- undeclared executable binaries;
- imports escaping the component package;
- secret-like files such as `.env`, credentials, private keys, and VCS internals;
- remote scripts or code fetched at runtime;
- malformed CSS/JSON or missing required manifest files;
- digest or size mismatches;
- archives that exceed limits during streaming extraction.

Preview HTML is untrusted content. It is either shown through the existing user-content
boundary or not rendered in Trace v1; it must never execute on the main app origin.

## Failure and Recovery

- If session creation fails, mark the draft failed and retain an actionable error.
- If the agent needs input, keep status `generating` and use normal session
  `needs_input` behavior.
- If packaging or validation fails, retain the generation session, record the concise
  validation error, and allow retry after the agent repairs files.
- If upload succeeds but publication fails, delete the unreferenced object best-effort.
- If publication is retried with the same digest, return the existing version.
- If a runtime expires before packaging, restore the generation session normally and
  retry from the pushed commit.
- If materialization fails, the Design session remains recoverable through the existing
  workspace retry path and requests a fresh signed URL.
- If regeneration fails and an active version exists, keep the active version ready for
  selection.

## Frontend and Zustand

Add normalized `designSystems` and `designSystemVersions` tables to client-core entity
state and event handlers. Select individual fields with fine-grained selectors.

Suggested web components:

```text
components/design-system/
├── DesignSystemCombobox.tsx
├── CreateDesignSystemDialog.tsx
├── DesignSystemList.tsx
├── DesignSystemListItem.tsx
├── DesignSystemDetails.tsx
├── DesignSystemStatus.tsx
└── DesignSystemPreview.tsx
```

Split the existing generated-project dialog so selecting Design opens a focused Design
creation form. Keep App and PDF creation unchanged. Do not add shared selection state via
React context; dialog-local form state may remain local, while fetched entities and
cross-screen creation state belong in Zustand.

The mobile app should initially support selecting an existing ready system if parity is
required for launch. Creating or managing systems can route users to web in the first
release, but mobile must never silently create with a different system than the user
selected.

## Observability

Log structured lifecycle records with organization, design-system, version, session,
source repo, source commit, byte size, file count, digest prefix, duration, and failure
stage. Never log signed URLs or package contents.

Track metrics for:

- generation started/completed/failed;
- generation duration;
- package validation failure reason;
- compressed and uncompressed sizes;
- materialization latency and failure rate;
- Designs created by default versus custom system;
- regeneration and version-upgrade counts.

## Migration and Rollout

Existing `design` session groups receive a null `designSystemVersionId`, which means the
bundled Trace Default package. No existing managed repository or preview needs rewriting.
Once a group has an explicit version, null and explicit-default remain distinct so future
default changes cannot silently alter a pinned custom choice.

Deploy in this order:

1. Add nullable database columns/tables and server read compatibility.
2. Deploy bridge protocol support while the server still sends no package descriptor.
3. Deploy publication and materialization behind server feature flags.
4. Publish and validate the bundled Trace Default package.
5. Enable internal generation and end-to-end tests.
6. Enable the web selector and creation flow for selected organizations.
7. Remove flags only after publication and materialization metrics are healthy.

The shared bridge protocol addition must be capability/version gated. An older bridge
must receive a clear unsupported-runtime error for a selected custom system, never a
Design that starts without its package. Database rollback remains safe while new columns
are nullable; object-storage rollback consists of disabling new publication while
retaining already referenced immutable objects.

## Implementation Phases

### Phase 1 — Contracts and persistence

- Add GraphQL types, inputs, queries, mutations, and event enum values.
- Add Prisma models, relations, indexes, and migration.
- Run `pnpm gql:codegen` and `pnpm db:generate`.
- Add client-core entity types and event upserts.
- Implement package manifest/token/component validators with fixtures.
- Implement `DesignSystemService.list/create/archive` with authorization and events.

Exit criteria: entity lifecycle works with fixture packages; no generation or Design
selection yet.

### Phase 2 — Generation and publication

- Package the built-in skill for supported cloud coding tools.
- Add the generation prompt and session association.
- Add bridge package/upload command and response.
- Implement `publishFromSession`, S3 key allocation, server-side validation, digesting,
  idempotency, and cleanup.
- Trigger publication from the linked session completion/checkpoint flow.
- Add retry and regeneration behavior.

Exit criteria: a real repo-linked session produces a ready immutable version in both S3
and local-storage modes.

### Phase 3 — Selection and materialization

- Add `SessionGroup.designSystemVersionId` and `StartSessionInput` support.
- Extend session authorization, persistence, snapshot payloads, and events.
- Extend `prepare_app` with the package descriptor.
- Download, verify, validate, and atomically materialize before `workspace_ready`.
- Add the Trace Default package using the same contract.
- Update the Design agent instruction and starter read paths.

Exit criteria: a Design starts with no source-repo access and the agent successfully uses
the selected package.

### Phase 4 — Product UI

- Add the Design creation prompt and design-system combobox.
- Add the nested Create Design System flow.
- Add design-system list, status, details, preview, archive, regenerate, and retry UI.
- Wire queries into Zustand and rely on events for mutation reconciliation.
- Add loading, empty, generating, failed, archived, and stale-source states.

Exit criteria: the full flow is usable without GraphQL tooling or manual database work.

### Phase 5 — Component fidelity and token cleanup

- Add portable-component runtime validation and import seam.
- Improve generation recipes for framework-specific systems.
- Move Design primitives from duplicated JSON values toward direct semantic CSS tokens.
- Add explicit Design version upgrade with agent-assisted migration.

Exit criteria: supported portable components are used directly, unsupported components
degrade honestly to recipes/reference, and token values have one canonical source.

## Test Plan

### Unit tests

- Manifest parser accepts the v1 contract and rejects unknown/unsafe fields.
- Archive validator rejects traversal, links, duplicates, oversized content, and zip/tar
  bombs.
- Token validator catches missing roles, invalid aliases, and malformed CSS.
- Component validator catches external imports and undeclared assets.
- S3 keys are server-derived and organization scoped.
- Publication is digest-idempotent.
- Status transitions preserve an older active version on regeneration failure.
- Session start rejects inaccessible, missing, or invalid versions.

### Service tests

- Create authorizes the repo, creates the linked session, and emits full events.
- Publish creates a version and active pointer atomically.
- Failed DB publication removes the uploaded object.
- Archive preserves pinned Designs.
- Private group and organization boundaries cannot be crossed by ids supplied by clients.
- Event payloads can upsert entities without a follow-up query.

### Bridge tests

- Packaging stays within the verified workdir.
- Packaging is deterministic for identical inputs.
- Limits are enforced while walking and extracting.
- Materialization verifies digest before extraction.
- Atomic replacement never leaves a partial package.
- `workspace_ready` occurs only after successful materialization.
- Retry uses a fresh signed URL and restores the same version.

### Frontend tests

- The selector lists systems with an active published version and Trace Default,
  including a system that is generating its next version.
- Creating an App or PDF remains unchanged.
- Creating a Design sends the selected version id.
- Create-new returns to the flow with the published system selected.
- Events update generation state, active version, and errors.
- Archived/failed systems cannot be newly selected.

### End-to-end test

1. Connect a fixture repository containing Tailwind tokens and shared components.
2. Create a design system from it.
3. Let the generation session publish a version to the local storage adapter.
4. Remove source-repo access from the Design runtime.
5. Create a Design with the published version.
6. Assert the package exists before the first agent run.
7. Ask for a screen using a known token and portable component.
8. Verify the committed design and exported HTML contain the expected styling/component.
9. Regenerate the system and confirm the original Design remains pinned to v1.

## Expected File Touchpoints

The implementation should remain surgical, but likely touches:

- `packages/gql/src/schema.graphql`
- generated GraphQL files through `pnpm gql:codegen`
- `apps/server/prisma/schema.prisma` and a new migration
- `apps/server/src/services/design-system.ts` and tests
- `apps/server/src/services/session.ts` and tests
- `apps/server/src/schema/` thin resolver modules
- `apps/server/src/lib/storage/` only if streaming helpers are needed
- shared package contracts/validators under `packages/shared/` or a focused package if
  the implementation proves too large for `shared`
- `packages/shared/src/bridge.ts`
- `apps/server/src/lib/session-router.ts`
- `apps/container-bridge/src/bridge.ts`
- `apps/container-bridge/src/app-workspace.ts`
- `apps/container-bridge/design-starter/`
- `packages/client-core/src/events/handlers.ts` and entity state
- `apps/web/src/components/command/NewGeneratedProjectDialog.tsx`
- new `apps/web/src/components/design-system/` components
- generation-skill assets for both supported agent ecosystems

## Non-Goals for V1

- A public design-system marketplace.
- Live synchronization on every source-repository commit.
- Direct execution of arbitrary application components.
- Figma import.
- Editing tokens through a visual design-system editor.
- Automatic upgrades of existing Designs.
- Deleting referenced versions.
- Sharing design systems across organizations.
- Making the source repository available inside ordinary Design sessions.

## Final Acceptance Checklist

- [ ] A source repo can produce a validated package through an observable agent session.
- [ ] The package is immutable and retrievable through both S3 and local adapters.
- [ ] Postgres stores no package binaries.
- [ ] A Design pins a version and starts without source-repo access.
- [ ] Materialization completes before `workspace_ready` and the first prompt.
- [ ] The agent reads and uses guidance, tokens, components, and assets from local files.
- [ ] Existing Designs survive regeneration, archival, and source-repo access loss.
- [ ] Every mutation is service-owned and event-producing.
- [ ] Zustand reconciles from events rather than mutation results.
- [ ] Archive and package validation covers traversal, links, limits, secrets, and digest
      mismatches.
- [ ] Unit, service, bridge, frontend, and end-to-end tests pass.
- [ ] `pnpm gql:codegen`, `pnpm db:generate`, relevant targeted tests, and `pnpm build`
      pass before rollout.
