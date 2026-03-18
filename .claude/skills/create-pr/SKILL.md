---
name: create-pr
description: Commit, push, and create a GitHub PR from the current branch
user_invocable: true
argument: Optional base branch (defaults to "main")
---

# Create Pull Request

You are committing all changes, pushing, and creating a GitHub pull request.

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

     Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
     EOF
     )"
     ```
   - If there are multiple logical groups of changes, create multiple commits instead of one big one

5. **Understand all changes on the branch**: Run these in parallel:
   - `git log <base>..HEAD --oneline` to see all commits
   - `git diff <base>...HEAD` to see the full diff against base

6. **Push branch to remote**: Check if the branch tracks a remote (`git rev-parse --abbrev-ref @{upstream}` — if this fails, the branch isn't pushed). Push with `git push -u origin HEAD`. If already tracking, just `git push`.

7. **Generate PR title and body**: Analyze ALL commits and the full diff to write:
   - A concise PR title under 70 characters that captures the essence of the changes
   - A structured body using this format:

   ```
   ## Summary
   <1-3 bullet points describing what changed and why>

   ## Test plan
   <Bulleted checklist of how to verify the changes>

   Generated with [Claude Code](https://claude.com/claude-code)
   ```

8. **Create the PR**: Use `gh pr create` with a HEREDOC for the body:
   ```bash
   gh pr create --base <base> --title "the title" --body "$(cat <<'EOF'
   ## Summary
   ...

   ## Test plan
   ...

   Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

9. **Return the PR URL** so the user can click it.

## Important
- Do NOT use the Agent tool or TodoWrite tool
- Read the full diff — do not summarize from commit messages alone
- Keep the title short and meaningful
- The body should focus on *why*, not just *what*
- Do not commit files that likely contain secrets (.env, credentials.json, etc) — warn the user instead
