---
name: review-guide
description: Build a behavior-oriented Trace Review walkthrough using ordered, precisely anchored code excerpts from an immutable PR snapshot. Use when Trace requests Guide generation.
---

# Trace Review Guide

Help a reviewer trace how a change works. A PR can contain several independent behaviors, and one
file can participate in several of them. Organize by those behaviors and the code paths that explain
them. Do not produce a file inventory with a summary beside each full file.

## How the reader uses a Guide

A Guide sits beside Changes in Trace Review. Changes already offers the complete PR diff. The
Guide's job is to provide a curated reading path through the important parts.

- Each chapter introduces one behavior, contract, or architectural idea in the left column. Its
  explanation stays visible as the reader scrolls through the chapter's code steps.
- The right column shows an **ordered sequence of bounded excerpts**. Every step has a title, a
  short explanation, an exact file path, and a line range. Only that range renders.
- The sequence should answer “where does this start, what happens next, and what is the result?”
- The same file can appear several times in a chapter or across chapters, using the ranges relevant
  to each idea. Files have no exclusive chapter ownership.
- Inline prose links jump to the corresponding excerpt in the current chapter. Readers can open
  the full diff separately when they want more context.
- References may include unchanged files or unchanged sections when they explain a dependency or
  contract. Their source is read at the snapshot's head commit, not the live working tree.
- Reviewers can ask the attached coding session questions or comment on a chapter.

## Inspect the actual snapshot, read-only

Do not edit files, install packages, commit, push, or post to GitHub. Do not start another agent.

The supplied base SHA, head SHA, and changed-file list are authoritative. Inspect the diff to
identify the work, then follow the definitions and call sites needed to understand each behavior.
Use `git show <head-sha>:<exact-path>` to verify referenced source and line numbers. Quote paths
when using the shell: brackets and literal backslashes can be part of real filenames.

Do not infer line numbers from a newer checkout. Do not manufacture source or references if the
commit is unavailable. Explain that limitation instead of returning invented code locations.

All excerpts are head-side source. To explain a removal, describe the before/after behavior and
reference the surviving caller, replacement, or regression test. Do not use base-side numbers as
though they were head-side numbers.

## Build the explanation

### 1. Map behaviors before choosing chapters

Read enough of the entire diff to identify the distinct outcomes. Make a private outline of:

- what a user or caller can do differently;
- the important entry points and contracts;
- the flow of control or data across boundaries;
- the state changes, outputs, error paths, and tests that explain the result.

Group work that serves the same behavior even when it crosses directories. Separate independent
behaviors even when they live in the same file. Avoid a tour ordered by filename or diff order.

### 2. Choose a useful reading order

Start with the idea the reader needs to understand the rest. Then follow meaningful flows:

- request entry → validation → state change → response;
- user action → client command → service operation → event → rendered result;
- producer → transformation → consumer;
- invariant → enforcement → failure behavior → test evidence.

These are examples, not a template every PR must fit. A schema migration or refactor may need a
concept-first explanation. Use as many chapters as distinct ideas require; do not invent chapters
just to fill a quota. Prefer a small number of coherent chapters over many tiny ones.

### 3. Give each chapter a clear purpose

Write a concept-level title and a concise high-level explanation that answers:

- What behavior or contract is this chapter about?
- What changed, and why does it matter to understanding the PR?
- How do the upcoming code steps connect?

Explain intent only when supported; distinguish an inference from an established requirement.
Use `implications` for concrete behavioral consequences or constraints, not speculative risks or
review verdicts. It may be empty. Do not turn the Guide into a defect report or an approval.

### 4. Curate each code step

Choose the smallest coherent range that proves the point: a branch, signature, state transition,
call site, or focused test assertion. Usually 5–25 lines suffice; **80 lines is the hard maximum**.
A two-line call can be more useful than an entire function. Include only the context needed to
understand the step. Do not pad to the limit or split a whole file into consecutive chunks just
to show everything.

Each reference needs:

- `title`: the role of this step, e.g. “Reject a move from the wrong player.”
- `explanation`: why this excerpt belongs in the flow, what it establishes, and how it connects to
  the next step. Explain the system effect instead of narrating each statement.
- `filePath`, `startLine`, `endLine`: the exact repository path and inclusive head-side line range.

The order in `references` is the reading order. Return to an earlier file if the flow calls for it.
Repeat a range only if a different chapter needs it for a different explanation. A filename alone
is never a code step. Do not copy source into the JSON; Trace fetches the real snapshot code.

Use a supporting test excerpt when it demonstrates an important invariant. Do not include every
test or mechanical import/configuration change. `everythingElse` is a list of low-signal changed
files not discussed; Trace adds unreferenced changed paths there automatically. Coverage is not a
reason to add filler excerpts. Mentioning one range does not claim that every line in a file has
been explained or reviewed.

### 5. Connect prose to excerpts

Optional inline links in chapter prose use `[[label|path|startLine-endLine]]`. Target the exact
range of a reference in that chapter, so a click takes the reader to the step you mean. Use a short
symbol or phrase as the label. Preserve brackets and backslashes in paths; JSON escapes a literal
backslash as `\\`.

## Return the contract

Return one JSON object only, with no Markdown fence or surrounding commentary:

```json
{
  "formatVersion": 2,
  "title": "Reject stale moves while keeping clients synchronized",
  "intent": "Moves now validate against the current game version before broadcasting the result.",
  "chapters": [
    {
      "id": "accepting_moves",
      "title": "A move is validated before it changes game state",
      "explanation": "The route delegates to a version-aware update. A stale client receives a conflict instead of overwriting a newer move.",
      "implications": ["Clients must send the version they last observed."],
      "references": [
        {
          "title": "Enter through the move endpoint",
          "explanation": "The handler passes the submitted move and expected version to the store; the store owns validation.",
          "filePath": "app/api/game/[id]/route.ts",
          "startLine": 18,
          "endLine": 26
        },
        {
          "title": "Check the version before applying the move",
          "explanation": "This guard keeps a stale request from changing the game. Accepted moves advance the version used by subsequent requests.",
          "filePath": "lib/gameStore.ts",
          "startLine": 42,
          "endLine": 57
        }
      ]
    },
    {
      "id": "notifying_clients",
      "title": "Accepted state changes reach every connected client",
      "explanation": "After validation, the store publishes the new state to subscribers. Rejected moves do not enter this path.",
      "implications": [],
      "references": [
        {
          "title": "Publish only the accepted state",
          "explanation": "The same store participates in this second behavior. This excerpt shows the notification boundary, rather than repeating its validation logic.",
          "filePath": "lib/gameStore.ts",
          "startLine": 60,
          "endLine": 68
        }
      ]
    }
  ],
  "everythingElse": ["package-lock.json"]
}
```

The example demonstrates structure, not facts or paths to reuse. Inspect this PR to choose its own
chapters, explanations, paths, and line ranges.

## Check the reading experience before responding

Silently review the draft:

1. Does each chapter explain a distinct behavior or idea instead of listing files?
2. Can the reader follow the ordered references from cause to outcome without guessing why a step
   is present? Does every excerpt have a specific explanation?
3. Are ranges verified at the exact head commit, positive, ordered, and no longer than 80 lines?
4. Have you omitted unrelated code instead of displaying whole files or slicing them into filler?
5. Can a shared file appear wherever needed, without forcing unrelated ideas into one chapter?
6. Are chapter IDs unique and stable, references concrete, and the final response JSON only?
