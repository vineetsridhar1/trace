# Trace Review System v1

Status: product and implementation specification (2026-09-30).

This document defines Trace's code-review experience. It adopts the useful review
principles studied in Plannotator—reviewable snapshots, anchored comments, an
explanation-first guide, and an AI that can answer in context—without importing
its planning product or creating a separate review runtime.

Where this document conflicts with an earlier exploratory discussion, this document
controls for v1.

## Goal

Let a developer review either their own AI-assisted work or someone else's pull
request without leaving Trace:

- inspect an immutable code diff;
- leave durable team review comments in Trace;
- ask the coding agent focused questions from a line, a thread, or the Guide;
- understand the change through a generated, explanation-first Guide; and
- deliberately send selected review feedback to GitHub.

The experience is a **Review tab**, not a session type, an independent agent, or
a replacement for GitHub. Trace owns the review workspace and its collaboration;
GitHub remains the external pull-request delivery target.

## Product Definition

### The two ways a review starts

1. **Review my work.** A coding session group has a linked pull request. Its new-tab
   picker offers **PR Review** in place of the Application option. Opening it creates
   or focuses that PR's Review tab in the same group.
2. **Review someone else's PR.** In a normal coding session, the user asks to review
   a pull-request URL. The agent invokes the managed CLI review-open command. Trace
   resolves the PR, creates or reopens the Review tab in the current group, and
   focuses it.

The Review tab is linked to its channel, source session group when present, repository,
and pull request. Those are peer links in Trace's flat entity model; the review is not
nested inside a session or channel record.

### What is and is not a Review tab

| A Review tab is | A Review tab is not |
| --- | --- |
| A persistent Trace entity backed by snapshots, threads, Guide results, and events. | A new session kind or a new coding workspace. |
| A tab that can sit beside coding, terminal, and other session-group tabs. | A live mirror that mutates the PR automatically. |
| A collaboration surface for team comments and AI-assisted understanding. | A separate review-model or side-chat runtime. |
| A GitHub delivery staging area. | A copy of GitHub's entire PR UI. |

## Core Decisions

- A review has one current immutable **snapshot** of the PR diff. New commits create a
  new snapshot rather than changing the evidence beneath existing comments.
- Comments are created in Trace first. Sending them to GitHub is an explicit later
  action and is per-thread selectable.
- Every AI action, including Guide generation, uses the review's attached normal
  **coding session**. Trace never creates a hidden review agent or calls a backend LLM
  for the feature.
- A review has one FIFO **Review Chat** queue. Guide generation and all inline AI
  questions go through it sequentially.
- The normal coding-session transcript remains canonical. Review Chat is a filtered,
  anchored projection of review-related messages from that session, not a new generic
  side-chat primitive.
- Large raw patches and file contents live in object storage. The database stores
  metadata, anchors, structured review data, delivery state, and references to blobs.
- All mutations enter through Trace services and append immutable events. Clients and
  agents never create events directly.

## User Experience

### Opening a review

On open, Trace:

1. resolves the linked PR or supplied PR URL and verifies repository access;
2. fetches its base SHA, head SHA, changed-file metadata, and patch;
3. stores a review snapshot and its diff payload;
4. opens the Review tab immediately on **Changes**; and
5. does nothing on GitHub and sends no agent prompt merely because the tab opened.

The opening state should make the boundaries obvious:

> This review is pinned to `base…head`. Comments stay in Trace until you choose
> **Send to GitHub**. Generate a Guide when you want an AI walkthrough.

If a refresh finds a newer PR head, Trace creates a new current snapshot and shows a
non-blocking banner: **New commits available — view latest snapshot**. The prior
snapshot, Guide, and comments remain available as history. Trace must never silently
retarget a comment to changed code.

### Changes view

The primary review surface has two top-level views:

```text
Review: Add workspace permissions                 [Changes] [Guide]
PR #482 · base 5bd2… → head 8f19… · 12 files

+------------------------+------------------------------------------------------+
| Changed files sidebar  | One continuous, scrollable diff                      |
| src/auth/policy.ts     | src/auth/policy.ts                                   |
| +42 -8 · 2 comments    | [full file diff]                                     |
|                        |                                                      |
| apps/server/routes.ts  | apps/server/routes.ts                                |
| +15 -2                 | [full file diff]                                     |
|                        |                                                      |
| …                      | …                                                    |
+------------------------+------------------------------------------------------+
```

- **Changed files sidebar** reuses Trace's existing diff sidebar. It lists changed files,
  additions/deletions, viewed state, and comment badges.
- **Continuous diff** renders every changed file in a single scrollable main pane. It
  supports split and unified rendering, syntax highlighting, collapsed unchanged context,
  and stable line selection.
- Clicking a file in the sidebar scrolls the main pane to that file. Scrolling the main
  pane updates the active file in the sidebar.
- Selecting a line or range opens a compact composer with two intentional paths:
  **Comment for team** and **Ask AI**.
- **Comment for team** creates a Trace review thread. It does not call GitHub.
- **Ask AI** creates a queued Review Inquiry whose full code anchor and local context
  travel with the message to the attached coding session.

The Review tab is the only diff destination. Existing diff tabs are removed. Any action
that formerly opened a file-diff tab—selecting Changes, a changed file, or a review
notification—opens or focuses the Review tab and navigates to the relevant snapshot,
file, and line. A Review tab is reused rather than duplicated.

### Team comments and GitHub delivery

A review thread can be line-anchored, file-level, or general. It supports replies,
resolution, reactions, edits according to normal Trace policy, and a delivery state.

| Thread state | Meaning |
| --- | --- |
| `trace_only` | Exists only in Trace. Default for every new comment. |
| `selected` | Chosen for the next GitHub submission. |
| `delivered` | GitHub accepted it; store remote IDs and timestamps. |
| `delivery_failed` | Keep the Trace thread intact and expose retry details. |
| `outdated` | Its anchor no longer resolves on the latest snapshot. It still points to its original snapshot. |

**Send to GitHub** opens a review-submission sheet. The user chooses eligible threads
and one GitHub review disposition: comment, approve, or request changes. Trace posts
using the actor's connected GitHub identity, records GitHub review/comment IDs on
success, and keeps Trace as the canonical collaboration history. Unselected comments
remain Trace-only, including private notes and AI discussions.

Submission must be idempotent: retrying a timed-out operation may recover its existing
GitHub delivery, but it must not create duplicate remote comments or reviews.

### Guide view

Guide is an optional, explanation-first way to review the **same snapshot**. The empty
state offers **Generate Guide**; it does not automatically spend model time just because
the Review tab is opened.

The Guide shows semantic chapters rather than merely repeating the file tree:

```text
+----------------------------------+---------------------------------------+
| What changed and why             | Related diff                         |
|                                  |                                       |
| 1. Permission model              | packages/auth/policy.ts               |
|    What / why / implications     | selected excerpts and line anchors    |
|                                  |                                       |
| 2. API enforcement               | apps/server/…                         |
|                                  |                                       |
| Everything else                  | remaining changed files               |
+----------------------------------+---------------------------------------+
```

- Each chapter has a title, concise explanation, implications, and one or more related
  code excerpts from the snapshot.
- The code side can create normal code review threads or inline AI questions.
- Comments on the prose/explanation side are Trace-only by default; a future version
  may offer conversion to a general PR comment.
- Guide structure is validated before saving: all referenced files and code ranges must
  belong to the target snapshot; every changed file must appear in exactly one chapter
  or in **Everything else**.
- A Guide is saved in the database against its snapshot. A new PR snapshot leaves the
  old Guide readable and marked as earlier; the latest snapshot requires a newly
  generated Guide.

## Snapshot and Anchor Model

### Snapshot

A snapshot is the frozen review target. At minimum it records:

- review and repository identifiers;
- source provider and remote PR identifier/URL;
- base and head commit SHAs;
- creation time, authoring actor, current/archived status;
- changed-file summary and normalized diff-format version; and
- object-storage references for patch and any retained file/excerpt payloads.

The client renders only data from the selected snapshot. This avoids the misleading
case where an old comment appears to refer to new source merely because the PR changed.

### Anchor

Every code-scoped thread and Review Inquiry stores:

- snapshot ID, file path, and diff side (`base` or `head`);
- start/end line plus optional original line;
- selected text / anchor text;
- bounded surrounding context;
- optional hunk identity and file blob identifiers; and
- an anchor status for the selected current snapshot.

On a new snapshot, an anchor resolver may safely classify anchors as still matching,
relocated, ambiguous, or outdated. It must preserve the original anchor verbatim and
must not automatically post or move a comment remotely. Ambiguous anchors are shown as
outdated until a user explicitly re-anchors them.

## AI: Attached Coding Session and Review Chat

### One existing session, one sequential queue

Each Review references one attached coding session. For an own-work review this is
normally the group’s coding session; for a PR-review request it is the coding session
that invoked review-open. The session must be authorized for the review repository and
its workspace must be capable of reading the reviewed revision.

Review Chat is a filtered list of messages in that session with review metadata. There
is no new chat entity and no parallel review sessions in v1.

```text
Generate Guide ─┐
Ask about line ─┼─> FIFO review queue ─> attached coding session ─> linked result
Ask about Guide ┘
```

Each queued item creates a `ReviewInquiry` association containing:

- review and snapshot IDs;
- a source kind (`guide_generation`, `diff_anchor`, `guide_anchor`, or `thread`);
- serialized anchor/context payload;
- `sessionMessageId` for the precise outgoing coding-session message;
- `responseMessageId` when the agent completes;
- position, state (`queued`, `running`, `completed`, `failed`, `cancelled`), and errors;
- optional structured-result reference for a Guide generation.

This preserves the exact relationship the user asked for: every inline question is
associated with the actual sent message and its response, while all questions answer in
order and share the same accumulated coding-session context.

### Agent contract

Every Review Inquiry must be rendered into a clear session instruction that includes:

- that this is review assistance, not an implementation request;
- the review/snapshot identity and base/head SHAs;
- the anchored file path, line range, selected code, and bounded surrounding context;
- the user's question or Guide-generation request;
- a read-only instruction: do not edit source, commit, push, or post to GitHub; and
- the requested response format.

The agent can use its existing workspace/tools to inspect the repository and answer,
but must not change it. Trace records only the correlation and structured artifacts;
the normal coding-session transcript stays the source of the conversation.

For Guide generation, the requested output is structured JSON conforming to a Trace
schema: title, intent, ordered chapters, explanations, implications, and snapshot code
references. The server validates it and saves a Guide only after validation. Invalid
output becomes a failed inquiry with a user-visible retry affordance, never a partially
trusted Guide.

### Multiple questions

If a user asks several inline questions, each appears immediately at its anchor with a
queued position. Only one message is dispatched to the coding session at a time. After
each response or terminal failure, the service advances the next item. A user can cancel
an item that has not started; cancelling a running item follows the session's existing
interruption semantics and must not corrupt later queue order.

This intentionally favors coherent accumulated context and one visible review
conversation over maximum parallelism. A later release can add concurrency only with
explicit per-inquiry execution isolation and ordering rules.

## Data Model

Names below are implementation guidance, not duplicated GraphQL types. The GraphQL
schema remains the type source of truth and Prisma models should reflect it.

| Entity | Key fields and relationships |
| --- | --- |
| `Review` | Organization, repository, channel links; optional source session/group; attached coding session; provider PR identity; current snapshot; status. |
| `ReviewSnapshot` | Review link; base/head SHAs; normalized diff metadata; object keys; status; provider synchronization metadata. |
| `ReviewThread` | Review and origin snapshot links; author; scope (`line`, `file`, `general`, `guide_explanation`); anchor; resolution; delivery status. |
| `ReviewComment` | Thread link; author; body; edit/deletion state; provider comment ID when applicable. |
| `ReviewGuide` | Review/snapshot links; generation inquiry; validated structured content; version/status. |
| `ReviewInquiry` | Review/snapshot/session links; anchor/context; session message correlation; queue state/position; response correlation; structured output status. |
| `ReviewDelivery` | Submission idempotency key; selected thread IDs; GitHub review disposition; remote review/comment IDs; attempts and failure information. |

Large payloads are not database columns. Store the normalized full patch, file blobs,
and any expensive generated diff artifacts in object storage using immutable keys such as
`reviews/<review-id>/snapshots/<snapshot-id>/…`. Persist checksums, byte lengths, and
format versions with each reference.

### Relationship rules

- Reviews, sessions, channels, repositories, and snapshots are organization-scoped peer
  entities linked by IDs.
- Deleting or archiving a session does not erase its Review Chat correlations, Guide, or
  review history.
- Review content must be permissioned by organization/repository/channel visibility;
  a linked session does not broaden a user's repository access.
- Provider credentials are connection/adaptor concerns. Review records store provider
  identities and remote IDs, never GitHub secrets.

## Services, Events, and API Shape

### Service-layer operations

Resolvers and CLI endpoints are thin authorization/adaptation layers over services.
Candidate operations:

- `openReviewForPullRequest` — validate access, resolve PR, create/reopen Review, fetch
  or select snapshot, and attach the coding session.
- `refreshReviewSnapshot` — fetch current provider state and append a snapshot only when
  base/head/diff identity changed.
- `createReviewThread`, `replyToReviewThread`, `editReviewComment`,
  `resolveReviewThread`, and `reanchorReviewThread`.
- `enqueueReviewInquiry`, `cancelReviewInquiry`, and queue advancement/terminal-result
  handling.
- `saveReviewGuide` — validate structured output against its snapshot and persist it.
- `submitReviewToProvider` — perform idempotent GitHub delivery.

Every mutation authorizes the full relevant surface, writes domain state transactionally,
appends complete entity payloads to the event store, and broadcasts those events. The
agent never writes review state directly; it returns a response through its normal
session mechanism, after which the service correlates and persists the result.

### Event families

The precise enum names belong in `packages/gql/src/schema.graphql`; v1 needs event
coverage equivalent to:

- `review_opened`, `review_snapshot_created`, `review_snapshot_marked_current`;
- `review_thread_created`, `review_thread_updated`, `review_comment_created`,
  `review_thread_resolved`, `review_thread_reanchored`;
- `review_inquiry_enqueued`, `review_inquiry_started`, `review_inquiry_completed`,
  `review_inquiry_failed`, `review_inquiry_cancelled`;
- `review_guide_saved`, `review_guide_failed`; and
- `review_delivery_started`, `review_delivery_succeeded`, `review_delivery_failed`.

Payloads must contain sufficient full entity snapshots for Zustand upserts. Review events
should be scoped to the Review, with normal channel/session visibility projections where
needed for tabs, badges, and activity feeds.

### GraphQL

Add review queries/mutations/subscriptions to the single schema source, then run codegen.
The initial surface should support:

- fetch a Review with current snapshot summary, file list, thread IDs, Guide summary,
  and queue state;
- fetch virtualized diff file/hunk payloads by snapshot and file path;
- create/comment/resolve/re-anchor threads;
- generate/retry/cancel Guide or inquiry work;
- select and submit review threads to GitHub; and
- subscribe to review-scoped events.

Do not encode business decisions in resolvers or let GraphQL mutation responses become
client state. The UI fires mutations optimistically where safe, then reconciles from
events into Zustand.

## GitHub and Provider Adapter Boundary

GitHub is the first provider, but review core must depend on a provider interface rather
than GitHub imports. The adapter should expose capabilities such as:

- resolve pull request and repository identities;
- fetch PR metadata, commits, changed files, and patches;
- determine a stable diff/commit identity;
- create a submitted review with general, file, and line comments;
- fetch delivery result/remote IDs; and
- report whether an anchor can be delivered against the selected head commit.

GitHub-specific conversion—GraphQL node IDs, diff sides, line conventions, rate-limit
responses, review-event semantics—belongs in the GitHub adapter. Provider failures are
visible in Trace without losing a local thread.

For v1, import of pre-existing GitHub review comments is out of scope unless required to
avoid duplication in a specific launch flow. Trace-created comments must always retain
their remote mapping after delivery.

## CLI Contract

Expose an allowlisted managed CLI command conceptually shaped as:

```sh
"$TRACE_CLI" review open <pull-request-url> --self --json
```

It should:

1. infer the active coding session, group, channel, and linked repository;
2. validate the URL belongs to an accessible configured provider/repository;
3. open or reuse the review associated with that PR in the current group;
4. arrange the focused Review tab; and
5. return review ID, current snapshot ID, and UI path.

The agent uses it only after the user asks to review the PR. Opening a Review does not
start Guide generation, modify code, send a chat message, or post GitHub feedback.

The final command name/options must be discovered and documented through the managed CLI
command catalog when implemented; no agent should guess an unsupported command.

## Frontend Architecture

Build a dedicated review feature tree rather than a monolithic review workbench:

```text
apps/web/src/components/review/
  ReviewTab.tsx
  ReviewHeader.tsx
  ReviewChangesView.tsx
  ReviewGuideView.tsx
  ReviewFileList.tsx
  ReviewDiff.tsx
  ReviewThread.tsx
  ReviewChatPanel.tsx
  ReviewSubmissionSheet.tsx
  guide/GuideChapter.tsx
  guide/GuideCodeExcerpt.tsx
```

The exact names can follow existing conventions, but preserve the boundaries:

- components receive IDs, not deep Review objects;
- Zustand holds normalized review entities and review-scoped events;
- urql is transport only, with normalized cache disabled;
- the file list, diff hunk list, threads, and chat are virtualized;
- the selected snapshot/view/file/thread are shared UI state in Zustand, not local state
  when more than one component needs them;
- Diff rendering loads file/hunk payloads on demand rather than fetching every large
  patch into the initial tab query; and
- use existing shadcn primitives and semantic Tailwind tokens.

The Review tab must remain usable while Guide generation, GitHub delivery, or a queued
question is pending. Those operations show local status and can update live through
events without resetting diff position or user drafts.

## Failure, Security, and Consistency Rules

- **No provider access:** explain that the PR could not be resolved; do not create a
  misleading empty review. Offer connection/access remediation.
- **Diff unavailable/too large:** retain snapshot metadata, show a recoverable fetch
  error, and avoid silently rendering a partial review as complete.
- **Agent/session unavailable:** queue the inquiry only when it can be durably delivered
  to the attached session; otherwise show a retryable failure. Never fall back to a
  different model/session without user direction.
- **Guide validation failure:** retain the session response correlation, mark generation
  failed, and do not display an unvalidated structured Guide.
- **GitHub partial delivery:** record exactly which thread deliveries succeeded/failed,
  keep local threads, and retry only safe undelivered work via idempotency keys.
- **New commits:** retain historical snapshots; classify anchors rather than silently
  rewriting them.
- **Permissions:** authorize review data and every related session/repository/provider
  surface at service boundaries. A user who loses repository access cannot use stale
  Review data to retrieve diff blobs.
- **Auditability:** events identify human or agent actor type and maintain an immutable
  account of review, Guide, and delivery actions.

## Phased Delivery

### Phase 1 — Review foundation and Changes

- Review, Snapshot, Thread, Comment, and Delivery persistence plus event schema.
- GitHub PR resolution and immutable diff snapshot capture.
- Review tab registration/opening for a linked PR and CLI-driven external PR review.
- Virtualized Changes view, code anchors, Trace-only comment threads, and current versus
  historical snapshot visibility.

### Phase 2 — GitHub delivery

- Submission sheet, selected-thread states, GitHub adapter delivery, idempotency, and
  per-thread remote mapping/failure UX.
- Integration tests against provider fixtures plus adapter contract tests.

### Phase 3 — Review Chat

- Attached-session association, durable FIFO Review Inquiry queue, message/response
  correlations, inline status/answers, and read-only review agent contract.
- Cancellation, retry, session-unavailable states, and end-to-end queue tests.

### Phase 4 — Guide

- Structured Guide schema, generation via the same queue, server validation, persisted
  snapshot linkage, chapter/excerpt UI, and explanation-side comments.

### Explicit v1 non-goals

- Plannotator-style plan authoring, planning sessions, or plan review.
- A dedicated review agent/session, backend LLM shortcut, or generic side-chat system.
- Parallel inline question execution.
- Automatic Guide generation, automatic GitHub posting, or automatic review approval.
- Full GitHub review-comment import/synchronization, PR merge controls, or CI dashboard.
- Editing the reviewed code from the Review tab.

## Acceptance Criteria

The first end-to-end implementation is complete when:

1. A user with a linked PR can open exactly one reusable Review tab in its session group;
   a coding-session request with a PR URL can open one through the managed CLI.
2. The tab renders a frozen base/head snapshot and makes it clear when newer commits
   exist without altering historical comments.
3. A user can create line, file, and general Trace comment threads, reload the app, and
   find them with their original snapshot anchors intact.
4. A user can select comments, submit a GitHub review disposition, and see reliable
   per-thread delivery state without duplicate remote comments on retry.
5. Every inline AI request and Guide generation uses the linked coding session, is
   represented by an exact outgoing and incoming session-message correlation, and runs
   sequentially through one durable queue.
6. The agent's review instructions are read-only and include the correct snapshot and
   anchor context.
7. A generated Guide is stored against its snapshot, references only snapshot code, and
   remains available as history after the PR changes.
8. All state changes are service-owned, evented, authorized, and reflected in the
   frontend from event-driven Zustand updates rather than mutation-result state.

## Open Decisions Before Implementation

- Which existing session-tab model should own a standalone tab with no source session
  group, if product later permits one?
- Do we need first-class private visibility per thread in v1, or are Trace-only comments
  channel-visible by default with AI questions always private?
- What is the minimum initial GitHub authentication/connection experience, and where is
  it configured in the current integrations model?
- Should “request changes” require at least one selected thread, or permit a general
  review-only request-change action?
- What provider payload limit and object-storage retention policy should apply to very
  large diffs?
- Which existing session-message lifecycle event is the authoritative trigger for
  advancing the Review Inquiry queue?

These are implementation choices, not reasons to weaken the core guarantees above.
