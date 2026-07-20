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
- A first-class `design_system` session gives the user chat plus a live canvas showing
  foundations, assets, components, variants, states, and representative compositions.
- The session inspects a read-only source-repository checkout and edits a separate
  Trace-managed workbench; it never writes design-system output into the user's repo.
- Trace stores every published package version as an immutable object through the
  existing storage adapter (S3 in production and local storage in development).
- A user can select a ready design-system version before creating a Design.
- The selected version is materialized in the isolated Design workspace before the
  workspace reports ready and before the first agent prompt runs.
- The Design agent can use the package without reading the source repository.
- Existing Designs remain pinned to their original package version after later workbench
  edits and managed saves.
- Mutations go through the service layer and emit events containing enough data for
  Zustand to update without refetching.
- Corrupt, unsafe, incomplete, oversized, or inaccessible packages never become ready.
- Local development exercises the same service contract without requiring S3.

## Key Decisions

### The source repository is not runtime storage

The user's repository is a read-only extraction input and provenance source. The
authoring session uses a separate Trace-managed repository, and an ordinary Design
session never depends on being able to read the source repository.

The durable runtime artifact is an immutable `DesignSystemVersion` archive owned by
Trace:

```text
User repository
    -> read-only checkout in a design_system workbench
    -> live foundations/component canvas + chat iteration
    -> managed Git push (the durable save signal)
    -> package validation
    -> immutable S3 object + DesignSystemVersion row
    -> materialized into isolated Design workspace
```

### Authoring is a first-class session kind

Add `design_system` to `SessionGroupKind`. It is a cloud-hosted managed-workspace session
like `design`, but it uses a dedicated design-system starter and may receive a secondary
read-only source checkout. It is not a coding session and does not use the user's repo as
its primary `SessionGroup.repo`.

The workbench's hidden managed repo preserves chat-driven changes, checkpoints, canvas
source, and review output. The source repo remains an external reference that can be
refreshed or removed without corrupting a saved design-system version.

### Publication follows managed save, like Documents

The authoring agent already commits and pushes managed-workbench changes after each
completed response. That successful push is the durable Save signal. The managed Git
post-receive pipeline queues package validation/publication for the pushed commit, just as
Document pushes queue PDF export and Design pushes queue preview capture.

There is no separate publish button or agent-decided completion step. The UI shows
`Saving`, `Saved`, or `Publish failed`. A valid latest push stores an immutable version
and makes it active for new Designs. A failed or superseded push leaves the previous
active version untouched. The authoring session remains open for subsequent edits.

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
permissions, authoring sessions, events, and runtime delivery.

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
new publication is pending or failed. Each option shows the active version and
source-repository name when one exists. The last selected system may be suggested, but
the persisted organization default is a later feature.
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
- authoring environment when the normal session flow cannot select one automatically.

Submitting creates a draft design-system entity and a `design_system` session backed by
a hidden managed repo. Trace provisions the design-system starter, attaches a read-only
checkout of the selected source repo, and opens the workbench immediately.

The initial agent run inventories the source and builds the first complete canvas. The
user then iterates through ordinary chat: “make the primary green darker,” “add compact
button sizes,” “remove this font,” or “show the table loading state.” Every response
updates the actual package and the live canvas through Vite HMR.

The session layout is:

```text
+----------------------+-----------------------------------------------+
| Chat                 | Design System Canvas               [Saved] |
|                      |                                               |
| Initial extraction   | Foundations                                   |
| Agent progress       |   Colors · Type · Spacing · Radius · Motion  |
| Questions            |                                               |
| Follow-up changes    | Components                                    |
|                      |   Buttons · Forms · Navigation · Data display |
|                      |   Variants · Sizes · States · Compositions    |
+----------------------+-----------------------------------------------+
```

After each completed response, the agent runs deterministic checks/review, commits, and
pushes. The header changes from `Saving` to `Saved` when publication for that commit
succeeds. A successful first managed save changes the system from `draft` to `ready` and
creates version 1. Closing earlier does not discard work: the draft and managed session
remain resumable.

### Manage and update

A Design Systems view lists:

- name and description;
- status;
- active version;
- source repository, path, branch, and source commit;
- authoring session and latest publish state/commit;
- creation and last-published times;
- open workbench, refresh source, archive, and version-history actions.

Opening the workbench resumes the same `design_system` session. Refreshing the source
checkout is an explicit chat/action flow that never overwrites user-authored decisions
without showing the resulting canvas changes. The resulting managed push publishes the
next immutable version when valid. Existing Designs may expose an explicit **Upgrade
design system** action later; there is no silent upgrade.

## Design-System Workbench

Create `apps/container-bridge/design-system-starter/` by reusing the stable canvas,
artboard, token, review, export, and error-boundary infrastructure from the existing
Design starter. Do not fork those primitives blindly: move genuinely shared canvas
runtime pieces into a shared starter package/directory and keep the authoring contracts
separate.

The managed workbench contains:

```text
design-system/                  # saved package root; agent-owned
├── manifest.json
├── DESIGN.md
├── tokens.css
├── components.manifest.json
├── components/
├── assets/
├── preview/
└── source/evidence.json
design-system.canvas.json       # workbench board/section manifest
src/workbench/                  # visual specimen boards
├── FoundationsBoard.tsx
├── AssetsBoard.tsx
├── ComponentsBoard.tsx
└── CompositionsBoard.tsx
src/canvas/                     # stable shared runtime; not agent-owned
scripts/
├── check-design-system.ts
└── review-design-system.ts
```

`design-system.canvas.json` indexes stable visual boards and their viewport/layout
metadata. It is workbench state, not part of the downstream package. The boards render
directly from the package's `tokens.css`, portable components, component recipes, and
local assets so the canvas and saved artifact cannot drift into separate representations.

The first release requires these visible sections:

- **Foundations:** colors and semantic roles, typography specimens, spacing, grids,
  radii, borders, elevation, focus, and motion.
- **Assets:** logos, icons, imagery, and fonts with usage guidance.
- **Components:** component families with every declared variant, size, and meaningful
  default/hover/focus/disabled/loading/empty/error state.
- **Compositions:** representative combinations such as navigation, forms, cards, tables,
  dialogs, and domain-specific modules.

The agent may add sections for data visualization, editorial patterns, mobile-native
controls, or other source-backed needs. A managed push containing only empty placeholder
boards does not satisfy publication validation.

The workbench header shows the server-owned publication state: `saving`, `saved`, or
`failed`. While the agent is editing, the existing session state shows that work is in
progress. Once its response is committed and pushed, the managed-push pipeline owns the
status; there is no independent client-only dirty state or separate Save button.

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
│   ├── components.html
│   ├── foundations.png
│   └── components.png
└── source/
    └── evidence.json
```

Required files for v1:

- `manifest.json`
- `DESIGN.md`
- `tokens.css`
- `components.manifest.json`
- `preview/foundations.html` and `preview/components.html`
- `preview/foundations.png` and `preview/components.png`
- `source/evidence.json`

`components/` is required only when at least one manifest entry is `portable`; `assets/`
is required only when declared files need it. Other empty directories are omitted.

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

### Visual specimens

The visual portion is executable evidence, not an image-generation output. Workbench
boards render real tokens, portable components, and recipe fixtures in a browser. The
review harness visits deterministic foundation and component routes, rejects runtime
errors or external network dependencies, verifies declared variants/states are present,
then exports self-contained HTML and full-page PNG captures into `preview/`.

Publication fails when required specimens are missing, blank, stale relative to the
manifest, or omit declared variants. The PNGs provide fast human thumbnails; downstream
Design agents primarily consume the HTML, component source, tokens, and manifest.

### Source evidence

`source/evidence.json` records the source commit and the files used to derive each major
decision. This supports review and source refresh without making the source repo a runtime
dependency. It must not include secrets, environment files, complete unrelated source
files, or credentials.

## Data Model

Add Prisma enums generated into GraphQL through the normal schema/codegen path:

```text
DesignSystemStatus = draft | ready | archived
DesignSystemPublishStatus = idle | pending | publishing | published | failed
```

Authoring progress, runtime failure, and `needs_input` come from the linked session; they
are not duplicated as design-system statuses. Publication state describes only the latest
managed push. A failed or superseded publication leaves the last ready version active.

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
authoringSessionGroupId    String
createdById                String
publishStatus              DesignSystemPublishStatus
pendingCommitSha           String?
publishedCommitSha         String?
publishAttemptedAt         DateTime?
publishError               String?
createdAt                  DateTime
updatedAt                  DateTime
archivedAt                 DateTime?
```

`publishStatus` defaults to `idle`.

Constraints and indexes:

- unique `(organizationId, slug)`;
- index `(organizationId, status, updatedAt)`;
- index `sourceRepoId`;
- named relations for active version and authoring session group;
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
authoringSessionGroupId String
workspaceCheckpointId String?
workspaceCommitSha    String
manifest              Json
validationSummary     Json
createdById           String
createdAt             DateTime
```

Constraints and indexes:

- unique `(designSystemId, version)`;
- unique `(designSystemId, contentDigest)` to make repeated publication idempotent;
- index `(designSystemId, createdAt)`;
- indexes for authoring session group and workspace checkpoint provenance.

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
- `retryDesignSystemPublish(id: ID!): DesignSystem!`
- `archiveDesignSystem(id: ID!): DesignSystem!`

`CreateDesignSystemInput` contains `name`, `repoId`, optional `branch`, optional
`sourcePath`, and optional `environmentId`. Organization comes from the authenticated
request context. The returned DesignSystem exposes its `authoringSessionGroup`, allowing
the caller to navigate after creation. Publication is driven by the server-observed push
for that relationship; clients cannot supply a commit, package path, storage key, or
session-group override. Retry only re-enqueues the server-recorded failed commit.

Extend `StartSessionInput` with `designSystemVersionId: ID`. The returned mutation entity
is used only for navigation; Zustand receives shared state through organization events.

Resolvers validate input shape, call services, and format results. They contain no
authoring, storage, authorization, or state-transition logic.

## Service Layer

Create `DesignSystemService` with these primary methods:

### `list`

- Authorize organization membership.
- Return visible systems and their active versions.
- Exclude archived systems by default.

### `create`

- Authorize access to the organization and source repository.
- Validate the requested branch/path and unique slug.
- Allocate the design-system id before session creation so the initial prompt and
  output path are deterministic.
- Call `SessionService.start` with `kind: design_system`, cloud hosting, an initial
  source-inventory prompt, and internal source-checkout metadata. The session service
  creates a hidden managed repo for the workbench rather than using `sourceRepoId` as the
  group's primary repo.
- Use its existing `afterCreate({ tx, session, sessionGroup })` seam to create the draft
  design system, associate the authoring group, and append a deferred
  `design_system_created` event inside the same transaction as the session rows.
- Collect those deferred events in the coordinating service and publish them only after
  `SessionService.start` returns successfully. A failed session transaction therefore
  leaves no draft design system behind.

Do not place session creation logic in the resolver or open a nested transaction around
`SessionService.start`.

### `enqueuePublishForManagedPush`

- Invoke this from `ManagedGitService.recordPush` for each updated branch, beside the
  existing Design-preview and PDF-export consumers.
- Resolve `design_system` authoring groups whose hidden managed repo and branch match the
  push; never accept that association from an agent or client.
- Set `publishStatus: pending`, record `pendingCommitSha`, clear the previous transient
  error, append a full-entity update event, and enqueue asynchronous publication.
- Coalesce rapid pushes with latest-commit-wins semantics. A publisher may proceed only
  while its commit still matches `pendingCommitSha`.
- Ignore an initial starter commit that has no v1 manifest and leave the system `draft`.
  Once a package manifest or active version exists, an invalid pushed package is a real
  publication failure; the next valid push automatically retries through the normal
  path.

### `publishManagedCommit`

- Claim a pending commit with a compare-and-set transition to `publishing`.
- Resolve the exact `design-system/` tree from the server-owned managed bare Git repo at
  that commit, plus the source commit recorded in its evidence.
- Create a normalized deterministic archive, enforce path/type/size limits, validate all
  required package files and specimens, and compute the digest server-side.
- Upload through `StorageAdapter.putObject` under a server-owned S3 key.
- In one database transaction, and only if the commit is still current, create the
  immutable version, set it active, mark the system ready and `published`, record
  `publishedCommitSha`, clear `pendingCommitSha`/`publishError`, and append full-entity
  events.
- Treat an existing `(designSystemId, contentDigest)` as idempotent success and allocate
  ordinals under a transaction/unique-constraint retry.
- Delete an unreferenced uploaded object if validation, supersession, or the transaction
  fails. A superseded job must never create or activate a version.
- Do not terminate or archive the authoring session. Each later valid managed push may
  create and activate the next immutable version.

If publication fails, set `publishStatus: failed`, record a concise `publishError`, append
an update event, and retain the active version. `retryDesignSystemPublish` and a startup
reconciler can re-enqueue the same server-recorded commit without trusting client input.

### `archive`

- Mark the system archived and emit an event.
- Do not delete versions or package objects.
- Existing Designs continue to resolve pinned versions.

### Authoring-session integration

Treat `design_system` as a managed workspace kind alongside App, Design, and PDF for
cloud provisioning, managed-repo creation, cleanup, runtime locking, auto-save, and
checkpoint durability. Give it explicit labels, starter selection, preview routing, and
system instructions; do not scatter ad hoc `kind === "design_system"` checks.

The existing `isGeneratedProjectKind` helper currently encodes product assumptions for
App/Design/PDF. Either extend and audit every caller or introduce a more precise
`isManagedWorkspaceKind` helper so authoring sessions get shared infrastructure without
accidentally appearing in the Apps or Designs lists.

The `design_system` system instruction requires reading the source checkout and workbench
guidance, editing only agent-owned package/board files, keeping the canvas valid, running
checks and browser review, and pushing managed-workbench changes after each response. It
must explicitly prohibit writing to the read-only source checkout.

### Design-session selection integration

When `SessionService.start` receives `kind: design` and a version id:

- authorize the version through its organization-scoped design system;
- require the requested published version to exist and its parent system not to be
  archived; pending or failed authoring commits do not affect the active version;
- persist `designSystemVersionId` on the new group;
- include the full selected-version reference in `session_started` payloads;
- reject design-system versions for non-design groups in v1.

Restoring or joining an existing group inherits its pinned version and does not reject it
merely because the parent system was later archived.

## Events and Client State

Add event types:

- `design_system_created`
- `design_system_version_created`
- `design_system_updated`
- `design_system_publish_updated`
- `design_system_archived`

Payloads for entity-changing events include the complete normalized `DesignSystem` and,
when relevant, complete `DesignSystemVersion`. The client handler upserts them into new
`designSystems` and `designSystemVersions` entity tables. Lists derive from those tables;
mutation results do not update shared state.

Authoring output remains ordinary session output. Do not create a second progress-log
system. Design-system events record entity/publication lifecycle transitions, while the
linked session is the detailed audit trail. Selecting a version for a new Design is
recorded by the normal `session_started` event and its complete session-group payload; it
does not need a duplicative design-system event.

## Read-Only Source Checkout

The workbench managed repo and source repo are distinct. Extend `prepare_app` (or a
focused managed-workspace preparation command) for `design_system` with a server-resolved
source descriptor containing repository identity, exact ref/commit, source subdirectory,
and short-lived read credentials. Credentials are never committed, stored in package
evidence, or persisted in events/connection JSON.

The bridge materializes the source under a separate protected root such as
`/sources/<sessionGroupId>`, marks it read-only for the agent process where practical,
and returns `sourceWorkdir` with `workspace_ready`. The coding tool runs with the managed
workbench as CWD and may read the source path. Git pushes, auto-save, checkpoints, and
cleanup target only the managed workbench repo.

On runtime recreation, Trace restores the managed workbench from its managed remote and
rehydrates the exact source commit. Refreshing source is explicit and records the new
source commit in workbench evidence. If source access is later revoked, the existing
workbench and saved versions remain usable; only refresh/rescan is unavailable.

## Authoring Skill

Add a built-in `author-design-system` skill to supported cloud agent images and keep the
Claude and Codex copies aligned. It is selected by the server-owned `design_system`
instruction rather than requiring installation in the user's repository. The skill
handles both initial extraction and later chat-directed edits.

The skill workflow is:

1. Read repository instructions and the requested source boundary.
2. Inventory framework, styling system, packages, aliases, and build tooling.
3. Locate existing tokens, global styles, Tailwind themes, Storybook stories, shared
   components, fonts, icons, logos, screenshots, and brand documents.
4. Identify representative components and states.
5. Produce source-backed `DESIGN.md` guidance.
6. Normalize semantic tokens into `tokens.css` while recording source mappings.
7. Produce the component manifest and portable components where safe.
8. Build complete foundation, asset, component, state, and composition boards.
9. Write source evidence, excluding secrets and irrelevant files.
10. Run deterministic checks and browser review, inspect every screenshot, and repair
    failures.
11. Keep `manifest.json`, package files, and visual boards synchronized, then commit and
    push the managed workbench through the normal session flow.

The system instruction must prohibit changes to the source checkout. Expected edits are
the agent-owned package and workbench-board files in the managed repo. A follow-up chat
request edits the same artifact and reruns the affected validation/review; it does not
start a replacement session.

The skill must ask when it finds multiple unrelated design systems or cannot determine
the intended application/package. It should not ask about choices that can be safely
derived and recorded with evidence. The agent never calls publication APIs or creates
versions. It runs local checks and pushes through the normal managed-session flow; the
server-owned managed-push consumer decides whether that exact commit is publishable.

## Managed-Push Publication and S3 Lifecycle

### Object key

Use a server-owned namespace separate from arbitrary uploads:

```text
design-systems/{organizationId}/{designSystemId}/{versionId}/package.tar.gz
```

The key is generated by the service and never accepted from a client or agent.

### Managed Git publication pipeline

Extend the managed Git storage abstraction with a safe `archiveSubtreeAtCommit`-style
operation. It reads `design-system/` directly from the server-owned bare repo at the
recorded commit, so publication does not depend on a still-running bridge or a
client-supplied workspace path.

The authoring skill runs `design-system:check` and `design-system:review` before its
normal commit/push, and commits the required HTML and PNG specimens. The server then
independently:

- verifies the pushed commit belongs to the linked workbench repo and branch;
- resolves only the expected subtree from that exact commit;
- rejects links, special files, traversal, unsafe paths, secrets, and out-of-bounds
  content while constructing a normalized archive;
- validates manifest/specimen completeness and recomputes the package digest;
- uploads via `StorageAdapter.putObject` and activates it only through the guarded
  database transaction;
- discards output when a newer push supersedes the commit;
- retries pending work after process restarts, following the existing managed-push
  Design-preview and PDF-export recovery pattern.

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
- Creating or refreshing the source checkout requires access to the source repository
  through the same authorization used by coding sessions.
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

- If authoring-session creation fails, the shared transaction rolls back the draft.
- If the agent needs input, keep the draft/ready entity unchanged and use normal session
  `needs_input` behavior; the canvas remains visible.
- If packaging or validation fails, retain the authoring session, set publication state
  to failed, record the concise validation error, and allow the user to ask the agent for
  a repair. Its next valid managed push publishes automatically; retry may re-enqueue the
  unchanged server-recorded commit.
- If upload succeeds but publication fails, delete the unreferenced object best-effort.
- If publication is retried with the same digest, return the existing version.
- If a runtime expires before its push, restore the authoring workbench from its managed
  remote and rehydrate the pinned source checkout. Publication of an already pushed
  commit proceeds server-side without that runtime.
- If materialization fails, the Design session remains recoverable through the existing
  workspace retry path and requests a fresh signed URL.
- Failed or superseded workbench commits never replace an active version.

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
├── DesignSystemPreview.tsx
├── DesignSystemPublishStatus.tsx
└── RetryDesignSystemPublishButton.tsx
```

Split the existing generated-project dialog so selecting Design opens a focused Design
creation form. Keep App and PDF creation unchanged. Do not add shared selection state via
React context; dialog-local form state may remain local, while fetched entities and
cross-screen creation state belong in Zustand.

Route `design_system` groups to the same immersive chat/preview shell used by Design,
with the design-system canvas title and managed publication indicator in its header. Add
a dedicated Design Systems sidebar section derived from
`DesignSystem.authoringSessionGroupId`; do not mix these groups into the ordinary Designs
or Apps lists. The existing virtualized session message list and preview components
should be reused with kind-specific empty state, labels, and toolbar actions.

The mobile app should initially support selecting an existing ready system if parity is
required for launch. Creating or managing systems can route users to web in the first
release, but mobile must never silently create with a different system than the user
selected.

## Observability

Log structured lifecycle records with organization, design-system, version, session,
source repo, source commit, byte size, file count, digest prefix, duration, and failure
stage. Never log signed URLs or package contents.

Track metrics for:

- authoring sessions created/resumed/failed;
- initial extraction duration;
- package validation failure reason;
- compressed and uncompressed sizes;
- materialization latency and failure rate;
- Designs created by default versus custom system;
- Publication attempts/success/failure/supersession and version-upgrade counts.

## Migration and Rollout

Existing `design` session groups receive a null `designSystemVersionId`, which means the
bundled Trace Default package. No existing managed repository or preview needs rewriting.
Once a group has an explicit version, null and explicit-default remain distinct so future
default changes cannot silently alter a pinned custom choice.

Deploy in this order:

1. Add nullable database columns/tables and server read compatibility.
2. Deploy bridge support for the new starter, read-only source checkout, and downstream
   package materialization while the server does not yet send those fields.
3. Deploy `design_system` authoring and publication behind server feature flags.
4. Publish and validate the bundled Trace Default package.
5. Enable internal authoring and end-to-end tests.
6. Enable the web selector and creation flow for selected organizations.
7. Remove flags only after publication and materialization metrics are healthy.

The shared bridge protocol addition must be capability/version gated. An older bridge
must receive a clear unsupported-runtime error for a selected custom system, never a
Design that starts without its package. Database rollback remains safe while new columns
are nullable; object-storage rollback consists of disabling new publication while
retaining already referenced immutable objects.

## Implementation Phases

### Phase 1 — Contracts, persistence, and session kind

- Add GraphQL types, inputs, queries, mutations, and event enum values.
- Add Prisma models, relations, indexes, and migration.
- Add `design_system` to GraphQL/Prisma session-kind enums and generated types.
- Introduce/audit managed-workspace kind helpers and every kind switch.
- Run `pnpm gql:codegen` and `pnpm db:generate`.
- Add client-core entity types and event upserts.
- Implement package manifest/token/component validators with fixtures.
- Implement `DesignSystemService.list/create/archive` with authorization and events.

Exit criteria: creating a DesignSystem atomically creates a draft and navigable
`design_system` group with a hidden managed repo; no source extraction or publication
yet.

### Phase 2 — Interactive authoring workbench

- Extract reusable canvas/review infrastructure from the Design starter without changing
  ordinary Design behavior.
- Add the design-system starter, fixed foundation/component canvas contract, HMR preview,
  error boundaries, and browser review scripts.
- Extend workspace preparation with a read-only secondary source checkout and exact source
  commit provenance.
- Package the `author-design-system` skill for supported cloud coding tools.
- Add the `design_system` system instruction, initial inventory prompt, empty states, and
  preview routing.
- Verify follow-up chat edits the same package/canvas and pushes the managed workbench.

Exit criteria: a user can open a draft workbench, watch the initial foundations and
components appear, chat to change them, and reload/resume the same managed workbench.
Package publication is not enabled in this phase.

### Phase 3 — Managed-save publication

- Add the managed-push consumer and exact-commit subtree archive helper.
- Add the pending/publishing/published/failed state machine, startup reconciliation, and
  retry mutation.
- Run deterministic workbench checks and browser specimen review before the normal agent
  commit/push, then validate their committed outputs again on the server.
- Implement S3 key allocation, server-side validation, digesting, idempotency, concurrent
  ordinal protection, latest-commit-wins guards, events, and cleanup.
- Require self-contained HTML and PNG foundation/component specimens.
- Preserve the authoring session after publication so later chat responses can publish
  later immutable versions.

Exit criteria: a valid managed push automatically publishes version 1 from the reviewed
canvas; a later valid push creates the next version, and failed or superseded pushes
retain the previous active version.

### Phase 4 — Design selection and materialization

- Add `SessionGroup.designSystemVersionId` and `StartSessionInput` support.
- Extend session authorization, persistence, snapshot payloads, and events.
- Extend `prepare_app` with the package descriptor.
- Download, verify, validate, and atomically materialize before `workspace_ready`.
- Add the Trace Default package using the same contract.
- Update the Design agent instruction and starter read paths.

Exit criteria: a Design starts with no source-repo access and the agent successfully uses
the selected package.

### Phase 5 — Product UI and management

- Add the Design creation form and design-system combobox.
- Add the nested Create Design System flow.
- Add a Design Systems sidebar/list entry that opens/resumes authoring sessions.
- Add publication status, active version, source provenance, archive, source-refresh, and
  version-history UI.
- Wire queries into Zustand and rely on events for mutation reconciliation.
- Add loading, draft, ready, saving, publish-failed, archived, and stale-source states.

Exit criteria: the full flow is usable without GraphQL tooling or manual database work.

### Phase 6 — Component fidelity and token cleanup

- Add portable-component runtime validation and import seam.
- Improve extraction/authoring recipes for framework-specific systems.
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
- Failed, unchanged, or superseded publication preserves the older active version and
  ordinal.
- Only the current `pendingCommitSha` can become active.
- Session start rejects inaccessible, missing, or invalid versions.

### Service tests

- Create authorizes the source repo, creates a managed `design_system` session, and emits
  full events atomically.
- Agent output alone does not create a version; the server-observed managed push does.
- A valid managed push creates a version/active pointer atomically without an explicit
  client publication call.
- Two rapid pushes coalesce safely and only the latest commit may publish.
- Failed DB publication removes the uploaded object.
- Archive preserves pinned Designs.
- Private group and organization boundaries cannot be crossed by ids supplied by clients.
- Event payloads can upsert entities without a follow-up query.

### Managed Git and bridge tests

- Exact-commit subtree archival stays within the package root.
- Packaging is deterministic for identical Git trees.
- Publication succeeds after the authoring runtime has stopped.
- Source checkout is separate, read-only, pinned to the requested commit, and excluded
  from managed-workbench commits/packages.
- Restoring a workbench rehydrates both the managed repo and exact source commit.
- Limits are enforced while walking and extracting.
- Materialization verifies digest before extraction.
- Atomic replacement never leaves a partial package.
- `workspace_ready` occurs only after successful materialization.
- Retry uses a fresh signed URL and restores the same version.

### Frontend tests

- The selector lists systems with an active published version and Trace Default,
  including a system whose latest publication is pending or failed.
- Creating an App or PDF remains unchanged.
- Creating a Design sends the selected version id.
- Create-new navigates to the authoring canvas; the first complete managed push publishes
  automatically.
- Chat changes visibly update boards and the header reports saving/saved/failed after the
  managed push.
- Events update active version and publication errors.
- Archived or never-published systems cannot be newly selected for a Design.

### End-to-end test

1. Connect a fixture repository containing Tailwind tokens and shared components.
2. Create a design system from it.
3. Assert the `design_system` workbench uses a managed repo and separate read-only source
   checkout.
4. Watch the initial color, typography, component-variant, state, and composition boards
   render and verify the completed response's managed push publishes version 1.
5. Use chat to change a token and add a component variant; verify HMR, screenshots, and
   the automatic publication of version 2 through the local storage adapter.
6. Push an invalid change and confirm version 2 remains active while publication shows a
   repairable error.
7. Push two valid edits rapidly and confirm only the latest pending commit becomes the
   next active version.
8. Remove source-repo access from the ordinary Design runtime.
9. Create a Design with version 1 and assert the package exists before its first agent
   run.
10. Ask for a screen using a known token and portable component.
11. Verify the committed design and exported HTML contain the expected styling/component.
12. Publish a later managed save and confirm the original Design remains pinned to
    version 1.

## Expected File Touchpoints

The implementation should remain surgical, but likely touches:

- `packages/gql/src/schema.graphql`
- generated GraphQL files through `pnpm gql:codegen`
- `apps/server/prisma/schema.prisma` and a new migration
- `apps/server/src/services/design-system.ts` and tests
- `apps/server/src/services/session.ts` and tests
- `apps/server/src/lib/generated-project.ts` or a new managed-workspace kind helper
- `apps/server/src/schema/` thin resolver modules
- `apps/server/src/lib/storage/` only if streaming helpers are needed
- shared package contracts/validators under `packages/shared/` or a focused package if
  the implementation proves too large for `shared`
- `packages/shared/src/bridge.ts`
- `apps/server/src/lib/session-router.ts`
- `apps/container-bridge/src/bridge.ts`
- `apps/container-bridge/src/app-workspace.ts`
- `apps/container-bridge/design-starter/`
- new `apps/container-bridge/design-system-starter/`
- `packages/client-core/src/events/handlers.ts` and entity state
- `apps/web/src/components/command/NewGeneratedProjectDialog.tsx`
- `apps/web/src/components/session/project-workspace-kind.ts`
- `apps/web/src/components/sidebar/` for the Design Systems section
- new `apps/web/src/components/design-system/` components
- authoring-skill assets for both supported agent ecosystems

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

- [ ] A source repo can seed a first-class chat-and-canvas authoring session without
      becoming the workbench repo.
- [ ] Every complete valid managed save publishes automatically; no explicit publication
      button or client-supplied package location exists.
- [ ] The package is immutable and retrievable through both S3 and local adapters.
- [ ] Postgres stores no package binaries.
- [ ] A Design pins a version and starts without source-repo access.
- [ ] Materialization completes before `workspace_ready` and the first prompt.
- [ ] The agent reads and uses guidance, tokens, components, and assets from local files.
- [ ] Existing Designs survive later saves, archival, and source-repo access loss.
- [ ] Every mutation is service-owned and event-producing.
- [ ] Zustand reconciles from events rather than mutation results.
- [ ] Archive and package validation covers traversal, links, limits, secrets, and digest
      mismatches.
- [ ] Unit, service, bridge, frontend, and end-to-end tests pass.
- [ ] `pnpm gql:codegen`, `pnpm db:generate`, relevant targeted tests, and `pnpm build`
      pass before rollout.
