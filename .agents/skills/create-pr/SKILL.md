---
name: create-pr
description: Commit, push, and create or update a GitHub PR from the current branch
user_invocable: true
argument: Optional base branch (defaults to "main")
---

# Create Pull Request

You are committing all changes, pushing, and creating (or updating) a GitHub pull request.

## Instructions

1. **Parse base branch**: Use the argument as the base branch. If no argument was provided, default to `main`.

2. **Get current branch**: Run `git branch --show-current`.

3. **Handle being on the base branch**: If the current branch equals the base branch:
   - Look at the staged/unstaged changes and recent context to generate a descriptive kebab-case branch name (e.g., `add-create-pr-skill`, `fix-auth-redirect`)
   - Run `git checkout -b <branch-name>`

4. **Commit all changes**: Run `git status` to check for uncommitted changes (staged, unstaged, or untracked). If there are any:
   - Stage everything: `git add -A`
   - Analyze the diff (`git diff --cached`) to understand what changed
   - Write a clear, concise commit message summarizing the changes
   - Commit using a HEREDOC:
     ```bash
     git commit -m "$(cat <<'EOF'
     Commit message here

     Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>
     EOF
     )"
     ```
   - If there are multiple logical groups of changes, create multiple commits instead of one big one

5. **Understand all changes on the branch**: Run these in parallel:
   - `git log <base>..HEAD --oneline` to see all commits
   - `git diff <base>...HEAD` to see the full diff against base — read the ENTIRE diff, not just the stat summary

6. **Push branch to remote**: Check if the branch tracks a remote (`git rev-parse --abbrev-ref @{upstream}` — if this fails, the branch isn't pushed). Push with `git push -u origin HEAD`. If already tracking, just `git push`. After a rebase, use `git push --force-with-lease`.

7. **Check for existing PR**: Run `gh pr view --json title,body,url` to check if a PR already exists for this branch.

8. **Generate PR title and body**: Read and analyze the FULL diff (not just commit messages or stat summaries) to write an accurate, high-quality title and body:

   **Title guidelines:**
   - Under 70 characters
   - Captures the core intent of the changes, not just file names
   - Uses action verbs: "Add", "Fix", "Refactor", "Replace", etc.
   - Focuses on *what the PR achieves*, not implementation details

   **Body guidelines:**
   - Summary bullets should explain *why* these changes were made, not just *what* files changed
   - Describe the user-facing or developer-facing impact
   - Mention architectural decisions if relevant (e.g., "Uses async request-response pattern over bridge WebSocket")
   - Test plan should be specific and actionable — describe concrete scenarios to verify, not generic checklists

   Format:
   ```
   ## Summary
   <2-4 bullet points — what changed and why, focusing on impact>

   ## Test plan
   <Bulleted checklist of specific verification scenarios>

   Generated with [Codex](https://Codex.com/Codex)
   ```

9. **Create or update the PR**:

   **If no PR exists** — create one:
   ```bash
   gh pr create --base <base> --title "the title" --body "$(cat <<'EOF'
   ## Summary
   ...

   ## Test plan
   ...

   Generated with [Codex](https://Codex.com/Codex)
   EOF
   )"
   ```

   **If a PR already exists** — compare your generated title and body against the existing ones. Update if:
   - The title doesn't accurately reflect the current state of the diff (e.g., scope changed, new features added)
   - The body is missing, incomplete, or describes changes that no longer exist
   - New commits have been added that aren't reflected in the description

   To update:
   ```bash
   gh pr edit --title "updated title" --body "$(cat <<'EOF'
   ## Summary
   ...

   ## Test plan
   ...

   Generated with [Codex](https://Codex.com/Codex)
   EOF
   )"
   ```

   If the existing title and body are already accurate, skip the update.

10. **Return the PR URL** so the user can click it.

## Important
- Do NOT use the Agent tool or TodoWrite tool
- Read the FULL diff — do not summarize from commit messages or `--stat` alone. The diff is the source of truth for what changed.
- Keep the title short and meaningful
- The body should focus on *why* and *impact*, not just *what files changed*
- Do not commit files that likely contain secrets (.env, credentials.json, etc) — warn the user instead
