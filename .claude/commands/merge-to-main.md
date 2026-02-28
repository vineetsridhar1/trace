---
description: Commit all changes, merge current worktree branch to the base branch, and push
allowed-tools: Bash(git:*), Bash(cd:*), Bash(gh:*)
---

# Merge to Base Branch via PR

You are merging the current worktree branch into the base branch by creating a GitHub PR and auto-merging it. The base branch is passed as an argument (e.g. `/merge-to-main main` or `/merge-to-main develop`). If no argument is provided, default to `main`.

**Important:** Never merge directly into the base branch locally. All merges must go through a GitHub pull request.

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

This step ensures merge conflicts are resolved in the worktree branch, not in the main repo.

1. Run `git fetch origin <base-branch>` to update the remote tracking branch.
2. Run `git rebase origin/<base-branch>`.
3. If there are merge conflicts, stop and inform the user about the conflicts. Do NOT force resolve. The user can resolve them here in the worktree safely.
4. If the rebase succeeds, the branch is up to date with the base branch.

## Step 5: Push branch to remote

Run `git push -u origin <branch-name> --force-with-lease` to push the branch (force-with-lease is needed after rebase).

## Step 6: Create PR

1. Analyze the changes using `git log origin/<base-branch>..HEAD --oneline` and `git diff origin/<base-branch>...HEAD --stat` to understand what's being merged.
2. Create a PR with `gh pr create --base <base-branch> --title "<concise title>" --body "<description>"`. The title should summarize the changes concisely. The body should include a brief summary of the commits/changes.
3. Capture the PR URL from the output.

## Step 7: Auto-merge the PR

Run `gh pr merge <pr-url> --merge --delete-branch` to merge the PR immediately and delete the remote branch.

If the merge fails (e.g. due to branch protection rules requiring reviews), inform the user that the PR was created but could not be auto-merged, and provide the PR URL so they can merge manually.

## Step 8: Update local base branch

1. Run `git fetch origin <base-branch>:<base-branch>` to fast-forward the local base branch to match the remote.

## Step 9: Report

Confirm success to the user, including:
- The PR URL
- What branch was merged
- What base branch it was merged into
- How many commits were included
- That the merge succeeded
