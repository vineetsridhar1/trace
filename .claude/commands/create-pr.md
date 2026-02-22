---
description: Stage, commit, and create a detailed GitHub PR — handles both new branches and main branch
allowed-tools: Bash(git:*), Bash(gh:*), Bash(cd:*)
---

# Create Pull Request

You are creating a GitHub pull request for the current changes. Follow these steps exactly:

## Step 1: Determine the current branch

Run `git branch --show-current` to get the current branch name.

## Step 2: Branch handling

### If on `main` (or `master`):

1. Look at all staged, unstaged, and untracked changes using `git status` and `git diff`.
2. Based on the nature of the changes, generate a descriptive branch name using kebab-case (e.g., `feat/add-user-auth`, `fix/login-redirect`, `refactor/cleanup-utils`). Use a conventional prefix: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`.
3. Create and switch to the new branch: `git checkout -b <branch-name>`.
4. Inform the user of the new branch name.

### If already on a feature branch:

Continue to the next step — no branch change needed.

## Step 3: Stage and commit changes

1. Run `git status` to see all changes.
2. If there are any staged, unstaged, or untracked files:
   - Stage everything with `git add -A`.
   - Analyze the diff (`git diff --cached`) to understand what changed.
   - Create a commit with a clear, descriptive message summarizing the changes. Use conventional commit style (e.g., `feat: add user authentication flow`). Include a body if the changes are non-trivial.
3. If there are no changes but there are unpushed commits, continue to the next step.
4. If there are no changes and no unpushed commits, stop and inform the user there is nothing to create a PR for.

## Step 4: Push the branch

Run `git push -u origin <branch-name>` to push the branch to the remote and set up tracking.

## Step 5: Analyze all changes for the PR

1. Run `git log main..<branch-name> --oneline` to see all commits that will be in the PR.
2. Run `git diff main...<branch-name>` to see the full diff against main.
3. Thoroughly analyze the changes to write a detailed PR description.

## Step 6: Create the pull request

Use `gh pr create` with:
- A concise, descriptive title (under 70 characters)
- A detailed body using this format:

```
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary

<2-5 bullet points describing what this PR does and why>

## Changes

<Detailed breakdown of the changes made, organized by area/file if needed>

## Test plan

<Bulleted checklist of how to verify the changes work correctly>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Step 7: Report to the user

Tell the user:
- The PR URL (from `gh pr create` output)
- The branch name
- A brief summary of what was included
