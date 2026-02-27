# Plan: Detect Squash and Rebase Merges

## Problem

The `isMergedInto` function in `src/main/ipc.ts:420-445` uses `git merge-base --is-ancestor` to detect merges. This only works for regular merge commits — squash and rebase merges create new commits, so the original branch is never an ancestor of the target. Tickets stay stuck in `completed`.

## Solution

Add a fallback path to `isMergedInto` when `--is-ancestor` fails: use `git merge-tree --write-tree <targetRef> <branch>` to compute a three-way merge in-memory. If the resulting tree OID equals the target's current tree OID, the branch's changes are already fully incorporated (squash/rebase merge).

## Why `merge-tree --write-tree`?

- **`git diff targetRef branch`** (two-dot): False negatives when other PRs land on main after the squash merge (diff shows those unrelated changes).
- **`git cherry` / patch-id**: Unreliable for squash merges that combine multiple commits.
- **`merge-tree --write-tree`**: Performs a full three-way merge without touching the working tree. If the branch is already merged by any strategy, merging it again produces no new content — the result tree equals the target's tree. Works correctly even when main has advanced with other PRs. Available since git 2.38.

## Change: `src/main/ipc.ts` — `isMergedInto` function (lines 419-445)

Replace the early return `if (ancestor.code !== 0) return null;` (line 422) with a fallback block that:

1. Validates both refs still exist (`rev-parse`)
2. Applies the no-op branch guard using `storedBaseSha`
3. Runs `git merge-tree --write-tree <targetRef> <branch>`
4. Compares result tree to `targetRef^{tree}`
5. Returns `true` if they match, `false`/`null` otherwise

The existing primary path (for regular/FF merges) is unchanged. No other files need modification.

## Edge Cases

| Scenario | Result |
|---|---|
| Regular merge commit | Handled by existing primary path (unchanged) |
| Squash merge | **New**: fallback detects via merge-tree |
| Rebase merge | **New**: fallback detects via merge-tree |
| Squash merge + main advanced with other PRs | **New**: still detected (merge-tree produces target's tree) |
| Not merged yet | merge-tree result differs from target tree → false |
| No-op branch (no commits) | storedBaseSha guard → false |
| Branch deleted | rev-parse fails → null → false |
| Merge conflicts | merge-tree exits code 1 → null → false |
| Git < 2.38 | merge-tree flag unrecognized → null → false (graceful degradation) |

## Performance

Adds ~3 extra git commands per branch only when `--is-ancestor` fails (squash/rebase case). `merge-tree --write-tree` typically completes in <100ms. With 10 branches polled every 30s, worst case adds ~0.5-1s per cycle.
