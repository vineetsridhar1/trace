---
description: Rebase the current branch's commits onto the latest main
allowed-tools: Bash(git:*)
---

# Rebase onto Main

You are rebasing the current branch's commits onto the latest version of main.

Follow these steps exactly:

## Step 1: Identify the current branch

Run `git branch --show-current` to get the current branch name. If on a detached HEAD, stop and inform the user.

## Step 2: Check for uncommitted changes

Run `git status`. If there are any staged, unstaged, or untracked changes, stop and inform the user:

> "You have uncommitted changes. Please commit or stash them before rebasing."

Do NOT proceed further.

## Step 3: Fetch the latest main

Run `git fetch origin main:main` to update the local `main` branch to match the remote.

## Step 4: Rebase onto main

Run `git rebase main`. If there are merge conflicts, stop and inform the user about the conflicts. Do NOT force resolve.

## Step 5: Confirm success

Inform the user:
- What branch was rebased
- How many commits were rebased (compare `git rev-list main..HEAD --count` before and after)
- That the rebase completed successfully
