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
- Every pushed authoring commit is archived to S3 as a durable draft commit artifact, even
  before the user publishes a version.
- Existing Designs remain pinned to their original package version after later workbench
  edits, commit artifacts, and publications.
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
    -> managed Git push
    -> immutable S3 workbench artifact for that commit
    -> explicit user Save of the latest valid commit artifact
    -> package validation and version publication
    -> immutable S3 object + DesignSystemVersion row
    -> materialized into isolated Design workspace
```

### Authoring is a first-class session kind

Add `design_system` to `SessionGroupKind`. It is a cloud-hosted managed-workspace session
like `design`, but it uses a dedicated design-system starter and may receive a secondary
read-only source checkout. It is not a coding session and does not use the user's repo as
its primary `SessionGroup.repo`.

The workbench's hidden managed repo preserves chat-driven changes, Git history, canvas
source, and review output. The source repo remains an external reference that can be
refreshed or removed without corrupting a saved design-system version.

### Every commit is saved to S3; publication remains explicit

The authoring agent already commits and pushes managed-workbench changes after each
completed response. Each successful push queues an immutable S3 artifact of that exact
tracked workbench tree, similar to the per-commit artifact pipeline used by Documents.
The managed Git remote is already enough to restore after a container dies; the S3
commit artifact adds an independent backup and makes the package available without
the original runtime.

The durability boundary is the managed push: Trace's authoring save flow must push
immediately after each commit rather than deferring until session shutdown. Once the
managed Git server acknowledges the push, the container may disappear; the server can
finish or retry the S3 write from its bare repo.

Persisting a commit artifact does not make a draft selectable by Designs. When the user
is satisfied, they press **Save** to validate and promote the latest fully uploaded commit
artifact into an immutable `DesignSystemVersion`. The UI therefore distinguishes cloud-save state
(`Saving`, `Saved`, `Save failed`) from publication state. A failed commit upload or Save
leaves the previous active version untouched, and the authoring session remains open.

### Git is the only authoring source of truth

The design-system flow must not read, write, wait for, or restore from Trace's
`GitCheckpoint` model or session checkpoint services. It does not persist a
`workspaceCheckpointId`, `checkpointId`, or `promptEventId`, and it does not call the
session checkpoint/capture pipeline. Current state is the managed branch HEAD; immutable
identity is the Git commit SHA; recovery is clone/fetch/checkout from the managed remote.
S3 objects and `DesignSystemCommitArtifact` rows are rebuildable projections keyed to Git
commits, never a competing source of workbench state.

The live canvas uses the authoring runtime and Vite HMR. Persisted canvas specimens come
from the HTML/PNG files committed into the workbench and copied into the S3 commit
artifact; design systems do not call the existing Design preview or App capture services.

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
active organization. A system remains selectable at its current active version while
newer draft commit artifacts exist. Each option shows the active version and
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
| Chat                 | Design System Canvas  [Cloud saved] [Save] |
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
pushes. The header changes from `Saving` to `Cloud saved` when the commit artifact for
that commit reaches S3. The first explicit Save changes the system from `draft` to `ready`
and creates version 1 from the latest saved commit artifact. Closing earlier does not
discard work: the draft, managed Git commit, S3 artifact, and managed session remain
resumable.

### Manage and update

A Design Systems view lists:

- name and description;
- status;
- active version;
- source repository, path, branch, and source commit;
- authoring session, latest commit-artifact state, and last-published commit;
- creation and last-published times;
- open workbench, refresh source, archive, and version-history actions.

Opening the workbench resumes the same `design_system` session. Refreshing the source
checkout is an explicit chat/action flow that never overwrites user-authored decisions
without showing the resulting canvas changes. The resulting managed push stores the next
S3 commit artifact; the user reviews it and presses Save to publish the next immutable
version. Existing Designs may expose an explicit **Upgrade design system** action later;
there is no silent upgrade.

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
boards is still stored as a commit artifact, but does not satisfy publication validation.

The workbench header shows server-owned commit-artifact state: `saving`, `saved`, or `failed`,
plus whether its valid package digest differs from the active published version. While
the agent is editing, the existing session state shows that work is in progress. **Save**
is enabled only when the agent is idle, the latest pushed commit has a completed S3
commit artifact, and deterministic package validation passes. None of these states are
maintained as independent client-only truth.

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

Every commit gets an S3 artifact even when required specimens are missing, blank, stale
relative to the manifest, or omit declared variants. Save refuses to publish such a
commit artifact. The PNGs provide fast human thumbnails; downstream Design agents primarily
consume the HTML, component source, tokens, and manifest.

### Source evidence

`source/evidence.json` records the source commit and the files used to derive each major
decision. This supports review and source refresh without making the source repo a runtime
dependency. It must not include secrets, environment files, complete unrelated source
files, or credentials.

## Data Model

Add Prisma enums generated into GraphQL through the normal schema/codegen path:

```text
DesignSystemStatus = draft | ready | archived
DesignSystemCommitArtifactStatus = pending | saving | saved | failed
DesignSystemPublishStatus = idle | publishing | published | failed
```

Authoring progress, runtime failure, and `needs_input` come from the linked session; they
are not duplicated as design-system statuses. Commit-artifact state describes whether the
latest pushed commit has reached S3. Publication state describes the explicit Save. A
failed commit upload or publication leaves the last ready version active.

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
latestCommitArtifactId     String?
latestPushedCommitSha      String?
authoringSessionGroupId    String
createdById                String
commitArtifactStatus       DesignSystemCommitArtifactStatus?
commitArtifactError        String?
publishStatus              DesignSystemPublishStatus
publishedCommitSha         String?
publishAttemptedAt         DateTime?
publishError               String?
createdAt                  DateTime
updatedAt                  DateTime
archivedAt                 DateTime?
```

`commitArtifactStatus` is null before the first managed push; `publishStatus` defaults to
`idle`.

Constraints and indexes:

- unique `(organizationId, slug)`;
- index `(organizationId, status, updatedAt)`;
- index `sourceRepoId`;
- named relations for active version and authoring session group;
- the source-repo relation uses `onDelete: SetNull`, while source name/URL/path/commit
  provenance remains preserved in each published version's manifest and evidence.

Add `DesignSystemCommitArtifact`:

```text
id                    String @id
designSystemId        String
sequence              Int
storageKey            String
contentDigest         String?
byteSize              Int?
commitSha             String
status                DesignSystemCommitArtifactStatus
packageValid          Boolean?
packageDigest         String?
validationSummary     Json?
error                  String?
createdById           String?
createdAt             DateTime
savedAt               DateTime?
```

Constraints and indexes:

- unique `(designSystemId, sequence)`;
- unique `(designSystemId, commitSha)` so push retries are idempotent;
- index `(designSystemId, createdAt)`;
- `DesignSystem.latestCommitArtifactId` points only to the greatest successfully saved
  sequence, so out-of-order workers cannot move the pointer backward.
- commit artifacts referenced by a published version use `onDelete: Restrict`.

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
designSystemCommitArtifactId String
workbenchCommitSha    String
manifest              Json
validationSummary     Json
createdById           String
createdAt             DateTime
```

Constraints and indexes:

- unique `(designSystemId, version)`;
- unique `(designSystemId, contentDigest)` to make repeated publication idempotent;
- unique `designSystemCommitArtifactId` so saving the same commit twice cannot create two
  versions;
- index `(designSystemId, createdAt)`;
- indexes for authoring session group and design-system commit provenance.

Add nullable `SessionGroup.designSystemVersionId`. Only `design` groups may set it in v1.
The relation uses `onDelete: Restrict`; a referenced version cannot be deleted.

Do not duplicate schema enums or GraphQL entity types in application code. Generate them
from `packages/gql/src/schema.graphql` and Prisma as appropriate.

## GraphQL Contract

Add query fields:

- `designSystems(organizationId: ID!, includeArchived: Boolean): [DesignSystem!]!`
- `designSystem(id: ID!): DesignSystem`
- `designSystemCommitArtifacts(designSystemId: ID!, first: Int, after: String):`
  `DesignSystemCommitArtifactConnection!`
- `designSystemVersions(designSystemId: ID!): [DesignSystemVersion!]!`

Add mutations:

- `createDesignSystem(input: CreateDesignSystemInput!): DesignSystem!`
- `saveDesignSystem(id: ID!): DesignSystemVersion!`
- `retryDesignSystemCommitArtifact(designSystemId: ID!): DesignSystem!`
- `archiveDesignSystem(id: ID!): DesignSystem!`

`CreateDesignSystemInput` contains `name`, `repoId`, optional `branch`, optional
`sourcePath`, and optional `environmentId`. Organization comes from the authenticated
request context. The returned DesignSystem exposes its `authoringSessionGroup`, allowing
the caller to navigate after creation. Managed pushes create commit artifacts for that
server-owned relationship. Save derives the latest successfully uploaded commit artifact
from the relationship; clients cannot supply a commit, package path, storage key, or
session-group override. Retry only re-enqueues the server-recorded failed commit artifact.

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

### `enqueueCommitArtifactsForManagedPush`

- Invoke this from `ManagedGitService.recordPush` for every updated authoring branch,
  beside the existing Design-preview and PDF-export consumers.
- Resolve `design_system` authoring groups whose hidden managed repo and branch match the
  push; never accept that association from an agent or client.
- Enumerate every newly introduced commit from the received old/new ref pair in
  topological order; a push containing several commits must create several artifacts,
  not merely one for its new branch head. Branch deletion creates none.
- Allocate monotonically increasing push sequences and idempotently create a
  `pending` row for every distinct commit, processing unusually large pushes in bounded
  batches rather than dropping intermediate commits.
- Record the newest commit as `latestPushedCommitSha`, set artifact status to `pending`,
  append full-entity/artifact events, and enqueue asynchronous S3 persistence.
- Do not coalesce pushes: every distinct pushed commit receives its own artifact row
  and object. Workers may run concurrently, but sequence guards prevent out-of-order
  completion from moving `latestCommitArtifactId` backward.

### `persistManagedCommitArtifact`

- Claim the pending row with a compare-and-set transition to `saving` so retries cannot
  upload the same commit artifact concurrently.
- Resolve the complete tracked workbench tree from the server-owned managed bare Git repo
  at the row's Git commit. This includes the package, canvas sources, and review output,
  but excludes ignored runtime files such as dependencies and credentials.
- Create a normalized deterministic archive and enforce path/type/size/secret limits.
- Independently inspect `design-system/` and record whether the commit currently
  satisfies the package and visual-specimen contract, including its normalized package
  digest. Invalid drafts are still archived.
- Upload through `StorageAdapter.putObject` under a server-owned commit-artifact key.
- Mark that row `saved`; if its sequence is newer than the current pointer, update
  `latestCommitArtifactId` in one transaction and append events. Update the design-system
  artifact status only if this row still matches `latestPushedCommitSha`, so an older
  worker cannot overwrite the latest commit's state.
- Treat an existing `(designSystemId, commitSha)` as idempotent success.
- On failure, mark only that artifact failed, update the design-system status only when
  it is the latest pushed commit, and retain the managed Git commit. A retry or startup
  reconciler can rebuild the object without the original container.

### `save`

- Authorize access to the design system and its authoring session group.
- Require the agent to be idle, resolve the authoring branch HEAD directly from the
  managed bare Git repository, and require `latestCommitArtifact.commitSha` to equal that
  HEAD. Database commit fields are projections for UI/event delivery, not authority.
- Require the commit artifact to be fully uploaded and its package validation to pass.
- Set `publishStatus: publishing`, record `publishAttemptedAt`, and append an update event
  before package promotion begins.
- Read the server-owned commit artifact, extract only `design-system/`, create the
  normalized package archive, validate it again, and verify the version digest matches
  the artifact's recorded package digest.
- Upload through `StorageAdapter.putObject` under a server-owned version key.
- In one database transaction, create the immutable version, set it active, mark the
  system ready and `published`, record `publishedCommitSha`, clear `publishError`, and
  append full-entity/version events.
- Treat repeated Save for the same commit or content digest as idempotent success and
  allocate ordinals under a transaction/unique-constraint retry.
- Delete an unreferenced version object if validation or the transaction fails.
- Do not terminate or archive the authoring session. Later commits continue creating S3
  commit artifacts but do not replace the active version until the user presses Save again.

If Save fails, set `publishStatus: failed`, record a concise `publishError`, append an
update event, and retain both the latest commit artifact and active version.

### `archive`

- Mark the system archived and emit an event.
- Do not delete versions or package objects.
- Existing Designs continue to resolve pinned versions.

### Authoring-session integration

Treat `design_system` as a managed workspace kind alongside App, Design, and PDF for
cloud provisioning, managed-repo creation, cleanup, runtime locking, automatic Git
commit/push durability, and S3 artifact generation. Give it explicit labels, starter
selection, preview routing, and system instructions; do not scatter ad hoc
`kind === "design_system"` checks.

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
- `design_system_commit_artifact_created`
- `design_system_commit_artifact_updated`
- `design_system_version_created`
- `design_system_updated`
- `design_system_publish_updated`
- `design_system_archived`

Payloads for entity-changing events include the complete normalized `DesignSystem` and,
when relevant, complete `DesignSystemCommitArtifact` or `DesignSystemVersion`. The client
handler upserts them into new `designSystems`, `designSystemCommitArtifacts`, and
`designSystemVersions` entity tables. Lists derive from those tables; mutation results do
not update shared state.

Authoring output remains ordinary session output. Do not create a second progress-log
system. Design-system events record commit-artifact and publication lifecycle transitions,
while the linked session is the detailed audit trail. Selecting a version for a new
Design is recorded by the normal `session_started` event and its complete session-group
payload; it does not need a duplicative design-system event.

## Read-Only Source Checkout

The workbench managed repo and source repo are distinct. Extend `prepare_app` (or a
focused managed-workspace preparation command) for `design_system` with a server-resolved
source descriptor containing repository identity, exact ref/commit, source subdirectory,
and short-lived read credentials. Credentials are never committed, stored in package
evidence, or persisted in events/connection JSON.

The bridge materializes the source under a separate protected root such as
`/sources/<sessionGroupId>`, marks it read-only for the agent process where practical,
and returns `sourceWorkdir` with `workspace_ready`. The coding tool runs with the managed
workbench as CWD and may read the source path. Git commits, pushes, S3 artifacts, and
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
versions. It runs local checks and pushes through the normal managed-session flow. That
push always creates a server-owned S3 commit artifact; only the user's Save action
promotes a valid commit to a published version.

## Per-Commit S3 Artifacts and Published Versions

### Object key

Use a server-owned namespace separate from arbitrary uploads:

```text
design-system-commits/{organizationId}/{designSystemId}/{commitSha}/workbench.tar.gz
design-systems/{organizationId}/{designSystemId}/{versionId}/package.tar.gz
```

Both keys are generated by the service and never accepted from a client or agent.

### Managed Git commit-artifact pipeline

Extend the managed Git storage abstraction with a safe `archiveTreeAtCommit`-style
operation. It reads the tracked workbench tree directly from the server-owned bare repo
at the recorded commit, so artifact generation does not depend on a running bridge or a
client-supplied workspace path.

The authoring skill runs `design-system:check` and `design-system:review` before its
normal commit/push, and commits the required HTML and PNG specimens. The server then
independently:

- verifies the pushed commit belongs to the linked workbench repo and branch;
- resolves the complete tracked tree from that exact commit;
- rejects links, special files, traversal, unsafe paths, secrets, and out-of-bounds
  content while constructing a normalized archive;
- records package/specimen validation results without rejecting an incomplete draft;
- uploads every distinct commit via `StorageAdapter.putObject` and records its digest;
- updates the latest pointer only when the completed artifact has the greatest
  sequence, without deleting or skipping earlier commits;
- retries pending work after process restarts, following the existing managed-push
  Design-preview and PDF-export recovery pattern.

The explicit Save path reads the selected latest commit artifact through `StorageAdapter`,
extracts and revalidates only `design-system/`, and writes the smaller immutable published
package. It does not need the bridge, source repository, or authoring container to still
exist.

### Retention

- Commit and published-version objects are immutable.
- V1 retains one artifact record/object for every distinct pushed commit. A later,
  explicit retention policy may expire unreferenced draft artifacts only after the
  managed Git remote and every published version remain recoverable.
- Failed partial uploads are deleted best-effort; the artifact row remains retryable.
- Archiving a design system does not delete commit or version objects.
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

Reject a workbench commit artifact entirely when it contains storage/security violations:

- absolute or parent-traversing paths;
- duplicate normalized paths;
- symlinks, hard links, sockets, and device files;
- secret-like files such as `.env`, credentials, private keys, and VCS internals;
- digest or size mismatches;
- archives that exceed limits during streaming extraction.

An incomplete or syntactically invalid design-system package is still a recoverable draft,
so its workbench artifact is stored with `packageValid: false`. Save additionally
rejects:

- undeclared executable binaries;
- imports escaping the component package;
- remote scripts or code fetched at runtime;
- malformed CSS/JSON or missing required manifest files;
- missing or stale required visual specimens.

Preview HTML is untrusted content. It is either shown through the existing user-content
boundary or not rendered in Trace v1; it must never execute on the main app origin.

## Failure and Recovery

- If authoring-session creation fails, the shared transaction rolls back the draft.
- If the agent needs input, keep the draft/ready entity unchanged and use normal session
  `needs_input` behavior; the canvas remains visible.
- If a commit-artifact upload fails, retain the managed Git commit, mark the artifact
  failed, and retry it from the bare repo. No authoring container is required.
- If package validation fails, still store the workbench artifact but disable Save and
  expose the concise validation error so the user can ask the agent for a repair.
- If version upload succeeds but Save fails, delete the unreferenced version object
  best-effort while retaining the commit artifact.
- If Save is retried with the same commit or digest, return the existing version.
- If a runtime expires before its push, restore the authoring workbench from its managed
  remote and rehydrate the pinned source checkout. S3 persistence and publication of an
  already pushed commit proceed server-side without that runtime.
- If materialization fails, the Design session remains recoverable through the existing
  workspace retry path and requests a fresh signed URL.
- New, failed, or superseded workbench commits never replace an active version until
  the user explicitly Saves one.

## Frontend and Zustand

Add normalized `designSystems`, `designSystemCommitArtifacts`, and `designSystemVersions`
tables to client-core entity state and event handlers. Select individual fields with
fine-grained selectors.

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
├── DesignSystemCommitArtifactStatus.tsx
├── RetryDesignSystemCommitArtifactButton.tsx
└── DesignSystemSaveButton.tsx
```

Split the existing generated-project dialog so selecting Design opens a focused Design
creation form. Keep App and PDF creation unchanged. Do not add shared selection state via
React context; dialog-local form state may remain local, while fetched entities and
cross-screen creation state belong in Zustand.

Route `design_system` groups to the same immersive chat/preview shell used by Design,
with the design-system canvas title, cloud-save indicator, and Save button in its
header. Add a dedicated Design Systems sidebar section derived from
`DesignSystem.authoringSessionGroupId`; do not mix these groups into the ordinary Designs
or Apps lists. The existing virtualized session message list and preview components
should be reused with kind-specific empty state, labels, and toolbar actions.

The mobile app should initially support selecting an existing ready system if parity is
required for launch. Creating or managing systems can route users to web in the first
release, but mobile must never silently create with a different system than the user
selected.

## Observability

Log structured lifecycle records with organization, design-system, commit artifact, version,
session, source repo, source/workspace commits, byte size, file count, digest prefix,
duration, and failure stage. Never log signed URLs or package contents.

Track metrics for:

- authoring sessions created/resumed/failed;
- initial extraction duration;
- commit-artifact queue/upload/retry latency and failure rate;
- commit-artifact bytes stored per system;
- package validation failure reason;
- compressed and uncompressed sizes;
- materialization latency and failure rate;
- Designs created by default versus custom system;
- Save/publication attempts, success/failure, and version-upgrade counts.

## Migration and Rollout

Existing `design` session groups receive a null `designSystemVersionId`, which means the
bundled Trace Default package. No existing managed repository or preview needs rewriting.
Once a group has an explicit version, null and explicit-default remain distinct so future
default changes cannot silently alter a pinned custom choice.

Deploy in this order:

1. Add nullable database columns/tables and server read compatibility.
2. Deploy bridge support for the new starter, read-only source checkout, and downstream
   package materialization while the server does not yet send those fields.
3. Deploy `design_system` authoring, per-commit S3 artifacts, and publication behind
   server feature flags.
4. Publish and validate the bundled Trace Default package.
5. Enable internal authoring and end-to-end tests.
6. Enable the web selector and creation flow for selected organizations.
7. Remove flags only after commit-artifact, publication, and materialization metrics are
   healthy.

The shared bridge protocol addition must be capability/version gated. An older bridge
must receive a clear unsupported-runtime error for a selected custom system, never a
Design that starts without its package. Database rollback remains safe while new columns
are nullable; object-storage rollback consists of disabling new artifacts/publication
while retaining already referenced immutable objects.

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
`design_system` group with a hidden managed repo; no source extraction, S3 artifacts, or
publication yet.

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
S3 commit artifacts and package publication are not enabled in this phase.

### Phase 3 — Per-commit S3 artifacts and explicit Save

- Add the managed-push consumer and exact-commit workbench-tree archive helper.
- Drive it exclusively from managed Git ref updates and raw commit SHAs; do not integrate
  with `GitCheckpoint` persistence, prompt events, or capture jobs.
- Persist every distinct pushed commit to its own S3 artifact object and row.
- Add artifact pending/saving/saved/failed state, monotonic latest-pointer guards,
  startup reconciliation, and retry mutation.
- Run deterministic workbench checks and browser specimen review before the normal agent
  commit/push, then record server validation results without rejecting incomplete draft
  commit artifacts.
- Add the explicit Save button and `saveDesignSystem` mutation to promote the latest
  saved, valid commit artifact.
- Implement S3 key allocation, server-side validation, digesting, idempotency, concurrent
  ordinal protection, events, and cleanup for both object types.
- Require self-contained HTML and PNG foundation/component specimens.
- Preserve the authoring session after publication so later chat responses keep creating
  commit artifacts and may be published by a later Save.

Exit criteria: every pushed commit has an immutable S3 artifact even after its container
is destroyed; no version exists until the user presses Save, and later commits retain the
previous active version until another Save.

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
- Add cloud-save status, Save state, active version, source provenance, archive,
  source-refresh, commit history, and version-history UI.
- Wire queries into Zustand and rely on events for mutation reconciliation.
- Add loading, draft, ready, cloud-saving, cloud-save-failed, publishing,
  publish-failed, archived, and stale-source states.

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
- Commit-artifact and version S3 keys are server-derived and organization scoped.
- Every distinct pushed commit gets a durable artifact row/object, including invalid
  package drafts.
- Out-of-order artifact workers cannot regress `latestCommitArtifactId`.
- Publication is digest-idempotent.
- Failed or unchanged Save preserves the older active version and ordinal.
- Only the artifact for managed branch HEAD may be published.
- Session start rejects inaccessible, missing, or invalid versions.

### Service tests

- Create authorizes the source repo, creates a managed `design_system` session, and emits
  full events atomically.
- Each managed push creates commit artifacts but not a version.
- Artifact creation, Save, and restore do not query or mutate `GitCheckpoint` and work
  without a prompt-event association.
- A single push containing multiple new commits creates an artifact for each commit in
  topological order.
- Two rapid pushes both reach S3 even when workers finish out of order.
- Save rejects a missing, stale, uploading, failed, or invalid HEAD artifact.
- Save creates a version/active pointer atomically from the valid HEAD artifact.
- Artifact retry succeeds after the authoring container has stopped.
- Failed DB publication removes the uploaded object.
- Archive preserves pinned Designs.
- Private group and organization boundaries cannot be crossed by ids supplied by clients.
- Event payloads can upsert entities without a follow-up query.

### Managed Git, storage, and bridge tests

- Exact-commit workbench archival includes only tracked files and stays within its root.
- Commit-artifact packaging is deterministic for identical Git trees.
- Artifact persistence and later Save succeed after the authoring runtime has stopped.
- Workbench restore clones/fetches managed branch HEAD without consulting
  `GitCheckpoint`.
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
  including a system with newer unpublished commits.
- Creating an App or PDF remains unchanged.
- Creating a Design sends the selected version id.
- Create-new navigates to the authoring canvas; managed pushes persist without
  publishing.
- Chat changes visibly update boards and the header reports cloud
  saving/saved/save-failed after each managed push.
- Save is disabled until the agent is idle and the HEAD artifact is saved and valid.
- Events update the latest commit artifact, active version, upload errors, and publication
  errors.
- Archived or never-published systems cannot be newly selected for a Design.

### End-to-end test

1. Connect a fixture repository containing Tailwind tokens and shared components.
2. Create a design system from it.
3. Assert the `design_system` workbench uses a managed repo and separate read-only source
   checkout.
4. Watch the initial color, typography, component-variant, state, and composition boards
   render and verify the completed response's managed push creates an S3 artifact but
   no published version.
5. Use chat to change a token and add a component variant; verify HMR, screenshots, and
   a second commit artifact through the local storage adapter.
6. Destroy the authoring container, verify both artifact objects remain, and restore
   the workbench at the latest managed commit.
7. Press Save and verify the valid artifact for managed branch HEAD becomes version 1.
8. Remove source-repo access from the ordinary Design runtime.
9. Create a Design with version 1 and assert the package exists before its first agent
   run.
10. Ask for a screen using a known token and portable component.
11. Verify the committed design and exported HTML contain the expected styling/component.
12. Make another chat edit, verify its commit does not replace version 1, press Save,
    and confirm the original Design remains pinned to version 1.

## Expected File Touchpoints

The implementation should remain surgical, but likely touches:

- `packages/gql/src/schema.graphql`
- generated GraphQL files through `pnpm gql:codegen`
- `apps/server/prisma/schema.prisma` and a new migration
- `apps/server/src/services/design-system.ts` and tests
- `apps/server/src/services/managed-git.ts` and managed-push recovery tests
- `apps/server/src/services/session.ts` and tests
- `apps/server/src/lib/generated-project.ts` or a new managed-workspace kind helper
- `apps/server/src/schema/` thin resolver modules
- `apps/server/src/lib/storage/` only if streaming helpers are needed
- the managed Git storage abstraction for exact-commit tree enumeration/archival
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
- [ ] Every distinct pushed workbench commit is saved as an immutable S3/local artifact
      and can be persisted or retried without its authoring container.
- [ ] Managed Git branch HEAD and commit SHA are the only authoring authority; no
      design-system path reads, writes, or waits for Trace `GitCheckpoint` records.
- [ ] No DesignSystemVersion is published until the user presses Save for a valid managed
      branch HEAD; clients cannot supply a commit or package location.
- [ ] Commit artifacts and published package objects are immutable and retrievable through both
      S3 and local adapters.
- [ ] Postgres stores no package binaries.
- [ ] A Design pins a version and starts without source-repo access.
- [ ] Materialization completes before `workspace_ready` and the first prompt.
- [ ] The agent reads and uses guidance, tokens, components, and assets from local files.
- [ ] Existing Designs survive later commits, Saves, archival, and source-repo access
      loss.
- [ ] Every mutation is service-owned and event-producing.
- [ ] Zustand reconciles from events rather than mutation results.
- [ ] Archive and package validation covers traversal, links, limits, secrets, and digest
      mismatches.
- [ ] Unit, service, bridge, frontend, and end-to-end tests pass.
- [ ] `pnpm gql:codegen`, `pnpm db:generate`, relevant targeted tests, and `pnpm build`
      pass before rollout.
