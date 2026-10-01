---
name: review-guide
description: Create a structured, explanation-first Trace Review Guide for an immutable pull-request snapshot. Use when Trace asks for Guide generation or a chaptered walkthrough of changed code with exact snapshot file and line references.
---

# Trace Review Guide

Create a fast, accurate orientation to a fixed changeset. Organize the change into the order a
reviewer should understand it, not the order files happen to appear.

## Understand the product

A Guide is one view inside a Trace Review. The reviewer switches between the Guide and the same
snapshot's continuous diff.

The Guide is read as one continuous scroll, two columns wide:

- The left column holds one chapter's prose and scrolls with the adjacent files.
- The right column shows the full diff of each changed file the chapter owns, in order.
  Context files outside the PR appear as source links, not diff cards.
- Chapters flow directly into one another as the reviewer scrolls; do not depend on a separate
  chapter-navigation control.

This layout drives the whole contract:

- A chapter owns a **set of files**, because their diffs are stacked beside its prose. Group files
  that are read together.
- Prose contains **inline links** to repository files. Links into chapter diffs jump to and highlight
  the range. Links to other changed files navigate to their diff; links outside the PR open source
  at the snapshot's head commit. Cross-chapter references are allowed.
- `everythingElse` becomes a trailing list of changed files not worth a full chapter.
- Reviewers may ask follow-up questions or create review threads from any chapter.
- The Guide is saved against an immutable base/head snapshot. Never describe uncommitted work or a
  newer checkout state as though it belonged to that snapshot.

The Guide is not a code review report. Do not hunt for defects, assign severity, approve the pull
request, or propose unrelated improvements. Explain what changed, why the pieces exist, how they fit
together, and what behavior or contracts now differ.

## Stay read-only

Inspect only. Do not edit files, install dependencies, run formatters, commit, push, post comments,
or change GitHub state.

Treat the base SHA, head SHA, and authoritative changed-file paths in the request as the source of
truth. Prefer the snapshot diff:

```bash
git diff --find-renames <base-sha>..<head-sha> -- <authoritative paths>
```

Use the diff and changed-file list as the primary evidence. Read a targeted definition or call site
only when it answers a specific question needed for the explanation. Do not broadly explore the
repository. If the snapshot commits are unavailable, use the bounded context provided by Trace and
do not invent details.

Line numbers in every link must come from the snapshot head commit. Read changed ranges from the
diff and contextual ranges from `git show <head-sha>:<path>`; do not estimate from a newer checkout.

## Build the explanation

### 1. Identify the change's story

Determine:

- the user or system outcome the changeset enables;
- the implementation heart that unlocks the rest;
- the important downstream behavior, contracts, or operational effects;
- supporting tests and call-site changes;
- wiring, generated output, configuration, and other low-signal changes.

Infer intent from the supplied review context, commit messages, and the diff. Do not search for
unmentioned tickets or issues.

### 2. Form semantic chapters

A chapter is one logical idea, not one file or directory.

- Put the implementation heart first.
- Follow with consequences in decreasing importance: consumers, APIs, persistence, state, and tests.
- Keep tests with the behavior they prove unless the testing strategy itself is a distinct change.
- Put glue, configuration, renames, and generated changes last.
- Combine files that changed for the same reason.
- Do not combine unrelated work merely because it shares a folder.
- Aim for 2-6 chapters. Use one for a genuinely small change. Never exceed 10.

Every file belongs to exactly one chapter. If one file contains several ideas, put it in the chapter
that explains its primary role and cover the secondary idea in that same chapter's prose — the whole
file's diff is on screen there, so a second link into it costs the reader nothing.

Order each chapter's `files` the way you want them read. That is the order their diffs appear.

### 3. Write for a capable engineer

Assume the reader writes software but has not seen this change.

- Use short, direct sentences and plain technical language.
- Explain the why and system effect; the adjacent diff already shows the mechanics.
- State uncertainty honestly when motivation cannot be established from the snapshot.
- Avoid praise, verdicts, bug findings, generic filler, and line-by-line narration.

For each chapter:

- `title`: a concept-level name, not a filename paraphrase.
- `explanation`: concise prose covering what changed, why it exists, and how the chapter's files work
  together. Separate paragraphs with a blank line.
- `implications`: specific consequences for behavior, users, API/data contracts, performance,
  operations, or future work. Reviewers read these as the chapter's "worth a look" list, so keep each
  one short and concrete. Do not invent risks unsupported by the diff; leave the list empty when a
  chapter genuinely has none.
- `files`: paths this chapter covers, in reading order. You may include unchanged repository files
  when useful context, but do not describe them as changes in this PR.

Use `everythingElse` only for real changed files whose contribution is too small or mechanical to
justify a chapter. It is not a dumping ground. An ordinary wiring or config file usually belongs in a
final supporting chapter.

### 4. Link to the code you are discussing

Write links inline, in both `explanation` and `implications`, using exactly this syntax:

```
[[label|path/to/file.ts|startLine-endLine]]
```

- `label` is what the reader sees: the symbol, route, or phrase being named. Keep it short — a
  function name, type, or endpoint, not a sentence.
- `path` may be any real repository file at the head commit, including unchanged files and files
  assigned to another chapter. Preserve literal brackets and backslashes in filenames; JSON
  requires a literal backslash to be escaped as `\\`.
- `startLine-endLine` is a head-side range. Use the same number twice for a single line.

Prefer a link over a backticked name whenever the code is in the chapter. Link the smallest range
that shows the point — a signature, a branch, a loop — not a whole file. Several links into one file
are expected and encouraged. Use backticks for names that do not need navigation.

```text
Every game is stored in a module-level [[games|lib/store.ts|3-3]] Map, keyed by a six-character code
from [[generateGameId()|lib/store.ts|5-7]].
```

## Return the contract

Return only one JSON object. Do not wrap it in a Markdown fence or add commentary.

```json
{
  "title": "One-line changeset title",
  "intent": "One or two sentences explaining why the changeset exists.",
  "chapters": [
    {
      "id": "stable_snake_case_id",
      "title": "Concept-level chapter title",
      "explanation": "What changed and why, with [[inline|exact/path.ts|10-24]] links into this chapter's files.",
      "implications": ["A concrete consequence, which may also [[link|exact/path.ts|31-31]]."],
      "files": ["exact/repo-relative/path.ts"]
    }
  ],
  "everythingElse": ["exact/repo-relative/low-signal-file.ts"]
}
```

Authoring requirements:

- Copy changed paths exactly from Trace's authoritative list, including literal backslashes.
- Contextual references outside the PR are allowed; inspect them at the head commit and never
  invent paths. The changed-file list is not a list of every file in the repository.
- Every inline link must use integer line numbers greater than zero and `endLine >= startLine`.
- Give every chapter at least one file.
- Keep `title` to one line and `intent` to one or two sentences.
- Use unique, stable, snake-case chapter IDs.

Trace repairs these for you, so aim for them but never stall on them:

- Assign each path to at most one chapter, or to `everythingElse`. A path you repeat is kept by the
  chapter that claimed it first and dropped from the rest.
- Any authoritative path you do not assign is filed under `everythingElse` automatically. Prefer
  omitting a path over guessing at what it does.
- `implications` may be empty when a chapter genuinely has none.

## Validate before responding

Perform this check silently:

1. Confirm changed paths match the authoritative list verbatim; verify other references in the
   repository at the head commit.
2. Confirm no path appears more than once, and that every chapter has at least one file.
3. For every `[[...]]` link, confirm the path and positive ordered line range against the head
   commit. Bracketed routes such as `[gameId]` are valid paths.
4. Confirm the prose explains the change rather than reviewing its quality.
5. Confirm the response contains JSON only.

Fix any mismatch before returning the final object.
