---
description: Commit all changes, merge current worktree branch to the base branch, and push
allowed-tools: Bash(git:*), Bash(cd:*)
---

# Merge to Base Branch

You are merging the current worktree branch into the base branch and pushing. The base branch is passed as an argument (e.g. `/merge-to-main main` or `/merge-to-main develop`). If no argument is provided, default to `main`.

Follow these steps exactly:

## Step 1: Verify this is a git worktree

Run `git rev-parse --git-common-dir` and `git rev-parse --git-dir`. If they are the same (i.e. this is NOT a worktree), **stop immediately** and tell the user:

> "This command only works from a git worktree, not the main repository. Please run this from a worktree."

Do NOT proceed further.

## Step 2: Identify the branch

Run `git branch --show-current` to get the current branch name. If on a detached HEAD, stop and inform the user.

## Step 3: Commit all working tree changes

1. Run `git status` to see what has changed.
2. If there are any staged or unstaged changes or untracked files, stage everything with `git add -A` and commit with a descriptive message summarizing the changes.
3. If there are no changes, skip this step and inform the user there was nothing to commit.

## Step 4: Rebase onto the base branch (in the worktree)

This step ensures merge conflicts are resolved in the worktree branch, not in the main repo. This is critical because if conflicts occur in the main repo, the app can crash mid-merge.

1. Run `git fetch origin <base-branch>:<base-branch>` to update the local base branch to match the remote.
2. Run `git rebase <base-branch>`.
3. If there are merge conflicts, stop and inform the user about the conflicts. Do NOT force resolve. The user can resolve them here in the worktree safely.
4. If the rebase succeeds, the subsequent merge will be a clean fast-forward.

## Step 5: Get the main repo working directory

Run `git rev-parse --git-common-dir` to find the common git dir path. The main repo working directory is the parent of the `.git` directory (strip the `/.git` suffix). Store this path.

## Step 6: Merge into the base branch

1. `cd` into the main repo working directory.
2. Run `git checkout <base-branch>` where `<base-branch>` is the argument provided (or `main` if none).
3. Run `git merge <branch-name>` where `<branch-name>` is from Step 2. This should be a fast-forward merge since we rebased in Step 4.
4. If there are merge conflicts (should not happen after rebase), stop and inform the user. Do NOT force resolve.

## Step 7: Push

Run `git push` from the main repo directory to push the base branch to the remote.

## Step 8: Return to worktree

`cd` back to the original worktree directory and confirm success to the user, including:
- What branch was merged
- What base branch it was merged into
- How many commits were included
- That the push succeeded
