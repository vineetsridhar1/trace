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

- The Guide title and intent frame the whole change.
- Each chapter appears as explanatory prose followed by implications and clickable code references.
- A reference takes the reviewer to that exact file and line range in the snapshot diff.
- `everythingElse` becomes a trailing list of changed files not worth a full chapter.
- Reviewers may ask follow-up questions or create review threads from the Guide and diff.
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

Every file may belong to only one chapter. If one file contains several ideas, place it in the
chapter that best explains its primary role and describe the relationship in that chapter. The UI
can navigate to one representative range per file; it does not need repeated references.

### 3. Write for a capable engineer

Assume the reader writes software but has not seen this change.

- Use short, direct sentences and plain technical language.
- Name concrete functions, types, routes, and behaviors with backticks.
- Explain the why and system effect; the adjacent diff already shows the mechanics.
- State uncertainty honestly when motivation cannot be established from the snapshot.
- Avoid praise, verdicts, bug findings, generic filler, and line-by-line narration.

For each chapter:

- `title`: a concept-level name, not a filename paraphrase.
- `explanation`: concise prose covering what changed, why it exists, and how the referenced files
  work together.
- `implications`: specific consequences for behavior, users, API/data contracts, performance,
  operations, or future work. Use an array of short strings. Do not invent risks unsupported by the
  diff.
- `references`: one entry for every file assigned to the chapter. Choose the smallest meaningful
  changed line range that helps the reviewer land on the file's main contribution.

Use `everythingElse` only for real changed files whose contribution is too small or mechanical to
justify a chapter. It is not a dumping ground. An ordinary wiring or config file usually belongs in
a final supporting chapter.

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
      "explanation": "What changed, why it exists, and how these files work together.",
      "implications": ["A concrete behavioral or contract consequence."],
      "references": [
        {
          "filePath": "exact/repo-relative/path.ts",
          "startLine": 10,
          "endLine": 24
        }
      ]
    }
  ],
  "everythingElse": ["exact/repo-relative/low-signal-file.ts"]
}
```

Hard requirements:

- Copy every path exactly from Trace's authoritative changed-file list.
- Account for every authoritative path exactly once across all `references` and `everythingElse`.
- Never repeat a file within a chapter, across chapters, or in `everythingElse` after referencing it.
- Never mention an unchanged or invented path.
- Use integer line numbers greater than zero, with `endLine >= startLine`.
- Ensure every chapter has at least one reference and at least one implication.
- Keep `title` to one line and `intent` to one or two sentences.
- Use unique, stable, snake-case chapter IDs.

## Validate before responding

Perform this check silently:

1. List the authoritative paths from the request.
2. List every `references[].filePath` and every `everythingElse` entry from the draft.
3. Confirm the lists are identical as sets and have the same length.
4. Confirm no path appears more than once.
5. Confirm each reference range uses positive ordered integers.
6. Confirm the prose explains the change rather than reviewing its quality.
7. Confirm the response contains JSON only.

Fix any mismatch before returning the final object.
