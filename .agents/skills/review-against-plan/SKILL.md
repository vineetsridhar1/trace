---
name: review-against-plan
description: Use when user says "review against plan", "plan review", "check against plan", or invokes /review-against-plan — performs a comprehensive review of the current PR against a project plan and its tickets, updating plan and tickets as needed
user_invocable: true
argument: "Required: path to a project folder (e.g., tickets/ai-agent). Optional second arg: specific ticket file (e.g., tickets/ai-agent/01-redis-infrastructure.md)"
allowed-tools: Bash, Read, Grep, Glob, Edit, Agent, Write
---

# Review Against Plan

You are acting as a **senior staff engineer and technical program manager** performing a comprehensive review of the current PR against the project's implementation plan and ticket system. Your job is threefold:

1. **Determine if the project plan needs updates** based on what this PR reveals
2. **Evaluate the PR's alignment** with the active ticket and overall plan
3. **Modify or create tickets** based on discoveries in this PR

## Step 1: Gather Context

### 1a: Locate the Project Folder

The user provides a **project folder path** as the first argument (e.g., `tickets/ai-agent`). This folder contains:

- A **plan file** — look for `plan.md`, `*.plan.md`, or any markdown file with "plan" in the name. If none exists, look for a top-level plan file referenced in the folder's README.
- A **ticket index** — look for `README.md` in the project folder. This contains the ticket list and dependency graph.
- **Ticket files** — all other `.md` files in the folder are individual tickets.

If no project folder is provided, check if the argument looks like a ticket file path and derive the project folder from its parent directory. If no argument at all, ask the user which project folder to use.

Also check for a **plan file at the repo root** (e.g., `ai-plan.md`, `plan.md`) that may be the canonical plan for this project folder. Read the project folder's README to determine which plan file is authoritative.

### 1b: Read Project Context

1. Read `AGENTS.md` at the project root to understand architecture rules and design principles
2. Read the **plan file** identified above to understand the full implementation plan
3. Read the **ticket index** (README.md in the project folder) to understand the ticket structure and dependency graph
4. If a specific ticket path was provided as a second argument, read that ticket. Otherwise, infer the active ticket:
   - Check the branch name for ticket references
   - Check recent commit messages for ticket references
   - If ambiguous, read the first few tickets and match against the PR's scope
5. Read **ALL tickets** in the project folder (not just the active one) to understand the full planned work and identify cross-cutting concerns

### 1c: Read PR Context

6. Determine the current branch and base branch:
   ```
   git branch --show-current
   git log --oneline main..HEAD
   ```
7. Get the full diff against the base branch:
   ```
   git diff main...HEAD
   ```
8. Get list of changed files:
   ```
   git diff --name-only main...HEAD
   ```
9. Read every changed file in full — you need complete context, not just the diff

## Step 2: Ticket Alignment Review

Evaluate how the PR maps to the active ticket:

- **Completion requirements**: Go through every checkbox in the ticket's completion requirements. For each one, determine: done, partially done, or not started. Be specific — cite the file and code that satisfies each requirement.
- **Scope match**: Does the PR do exactly what the ticket asks? Flag anything missing. Flag anything extra that wasn't in the ticket scope.
- **Test coverage**: Does the PR satisfy the ticket's "How to test" section? Are those test scenarios actually coverable with the current implementation?
- **Dependencies respected**: Does the ticket list dependencies? Are they actually met by prior work? Did the PR accidentally take on work from a downstream ticket?

## Step 3: "Is This the Right Approach?" Review

Before reviewing code quality, step back and challenge the fundamental design. This is the most important step — catching a correct implementation of the wrong approach is more valuable than catching bugs in the right approach.

Ask these questions:

- **Source of truth**: Is there exactly one source of truth for each piece of state? If the same data is tracked in multiple places (DB, in-memory cache, client-side file, etc.), flag it. Redundant state that must be kept in sync is a design smell — the fix is usually to derive the secondary copies from the primary source, not to add sync logic.
- **Could this be simpler?**: Is there a simpler approach that achieves the same goal with fewer moving parts, fewer code paths, or less state to manage? If you can describe a simpler alternative that a senior engineer would prefer, flag the current approach as a Major Issue and describe the alternative.
- **Does it scale?**: Will this approach work at 10x the current load? Are there unbounded queries, O(n) scans, or growing-without-bound collections that will become problems?
- **Would a senior engineer build it this way?**: Imagine handing this code to a principal engineer for review. Would they approve the approach, or would they push back on the fundamental design before even looking at the implementation details?

If the approach itself is wrong, flag it as a **Critical Issue** — no amount of polish on the implementation will fix a flawed design. Suggest the better approach concretely.

## Step 4: Architecture & Design Review

Evaluate against AGENTS.md principles and industry best practices:

- **Design principles alignment**: Does the code follow the project's stated architecture?
- **Separation of concerns**: Is business logic in the right layer? Are components focused?
- **API design**: Are interfaces clean, consistent, and hard to misuse?
- **Data modeling**: Are schemas correct? Any denormalization issues? Missing indexes?
- **State management**: Is state managed according to the project's conventions?
- **Error handling**: Are failure modes handled gracefully? No swallowed errors?
- **Extensibility**: Will this be painful to extend? Does it paint us into a corner?

## Step 5: Code Quality Review

Apply industry-standard code quality checks:

- **Readability**: Can a new team member understand this in one pass?
- **Naming**: Are variables, functions, types named clearly and consistently?
- **DRY**: Is there duplicated logic that should be extracted?
- **SOLID principles**: Single responsibility, open/closed, etc.
- **Type safety**: No `any` types. Proper use of generics. Correct nullability
- **Dead code**: Unused imports, unreachable branches, commented-out code
- **Complexity**: Functions doing too much? Deep nesting? Long parameter lists?
- **Constants**: Magic numbers or strings that should be named constants?

## Step 6: Security Review

Check for common vulnerabilities (OWASP Top 10 and beyond):

- **Injection**: SQL injection, command injection, XSS, template injection
- **Authentication/Authorization**: Missing permission checks, privilege escalation
- **Data exposure**: Sensitive data in logs, error messages, or client responses
- **Input validation**: Unsanitized user input, missing boundary checks
- **Secrets**: Hardcoded credentials, API keys, tokens
- **Dependencies**: Known vulnerable packages

## Step 7: Performance Review

- **Query efficiency**: N+1 queries, missing indexes, unbounded queries
- **Memory**: Unbounded collections, memory leaks, large object retention
- **Rendering**: Unnecessary re-renders, missing memoization where it matters
- **Bundle size**: Unnecessarily large imports, tree-shaking blockers
- **Concurrency**: Race conditions, missing locks, deadlock potential

## Step 8: Testing Review

- **Coverage**: Are critical paths tested? Are edge cases covered?
- **Test quality**: Do tests actually verify behavior or just exercise code?
- **Test isolation**: Are tests independent? No shared mutable state?
- **Naming**: Do test names describe the scenario and expected outcome?

## Step 9: Plan Impact Analysis

This is where the review diverges from a standard code review. Analyze the PR's implications for the broader plan:

### 9a: Assumptions Validated or Invalidated

- Did this PR reveal that a plan assumption was **wrong**? (e.g., "the plan assumed X was simple, but it turned out to require Y")
- Did this PR reveal that a plan assumption was **correct** in a way that unlocks shortcuts? (e.g., "the plan budgeted for X complexity, but the existing code already handles it")
- Did any architecture decisions in this PR **constrain or enable** future tickets differently than the plan anticipated?

### 9b: Dependency Graph Impact

- Does this PR change what downstream tickets depend on? (e.g., a new interface that downstream tickets should use)
- Does this PR make any planned ticket **easier, harder, unnecessary, or impossible**?
- Are there new integration points that the dependency graph doesn't capture?

### 9c: Missing Work Discovery

- Did this PR reveal work that **no existing ticket covers**? (e.g., a migration needed, a new adapter interface, a config system)
- Did the implementation surface **edge cases or requirements** that the plan didn't account for?
- Are there **follow-up items** from this PR that need to be tracked?

### 9d: Scope Drift Detection

- Is the plan's scope still accurate, or has this PR revealed that the scope should grow or shrink?
- Are there tickets in the plan that this PR's approach makes **obsolete** or that need **significant revision**?

## Step 10: Compile the Review

Present your findings in this structured format:

### Review Summary

One paragraph overall assessment. Is this PR ready to ship? What's the overall quality level? How well does it advance the plan?

### Ticket Completion Status

For the active ticket, list every completion requirement with its status:

- [x] **Requirement** — Done. `file:line` that satisfies it.
- [ ] **Requirement** — Not done. What's missing.
- [~] **Requirement** — Partially done. What remains.

### Approach Review

Is the fundamental design sound? Is there a simpler way? Are there multiple sources of truth that should be collapsed? If the approach is wrong, say so directly and describe the better alternative.

### Critical Issues (must fix before merge)

Issues that would cause bugs, security vulnerabilities, data loss, or architectural violations. A flawed fundamental approach counts as a critical issue.

For each:

- **File:line** — Description of the issue
- **Why it matters**: Impact if shipped as-is
- **Suggestion**: Specific fix or approach

### Major Issues (strongly recommend fixing)

Issues that hurt maintainability, violate conventions, or create tech debt.

Same format as critical.

### Minor Issues (nice to have)

Style, naming, small improvements. Keep this brief — don't be pedantic.

### What's Done Well

Call out 2-3 things the author did particularly well. Good reviews aren't only negative.

### Architecture Alignment

Summary of how well the code follows AGENTS.md principles. Note any drift.

### Plan Impact

Summarize findings from Step 9 in a clear, actionable format:

- **Assumptions changed**: List any plan assumptions that this PR validated or invalidated
- **Dependency graph changes**: Any impacts on the ticket dependency graph
- **New work discovered**: Any gaps the plan doesn't cover
- **Scope changes**: Any tickets that need revision or removal

## Step 11: Update Plan and Tickets

Based on your analysis, make concrete changes. Do NOT skip this step — the whole point of this review is to keep the plan and tickets synchronized with reality.

### 11a: Update the Plan File

Update the plan file (identified in Step 1a) if any of these are true:

- An assumption in the plan was invalidated by this PR's implementation
- The PR revealed a new architectural constraint or capability the plan should reflect
- The plan describes an approach that this PR proved infeasible or suboptimal
- There's a new cross-cutting concern the plan should address

When updating, add clear markers about what changed and why (e.g., `<!-- Updated after ticket 01: Redis Streams required a different approach for X -->`).

### 11b: Update Existing Tickets

Update downstream tickets in the project folder if:

- This PR created interfaces, types, or patterns that downstream tickets should reference
- This PR changed the shape of data or APIs that downstream tickets assumed
- A ticket's completion requirements need adjustment based on what this PR revealed
- A ticket's "Dependencies" section needs updating

When updating tickets, be specific: change the actual implementation details, not just add a note. Downstream tickets should be ready to pick up as-is.

### 11c: Create New Tickets

Create new tickets in the project folder if this PR revealed work that no existing ticket covers. New tickets must follow the format used by existing tickets in the folder. Look at 2-3 existing tickets to match the format exactly.

Assign the next available ticket number. Update the project folder's `README.md` to include the new ticket in the correct section with its dependencies in the graph.

### 11d: Mark Ticket Progress

If the active ticket's completion requirements are all satisfied by this PR, note that the ticket is complete. If partially done, update the checkboxes to reflect current state.

## Step 12: Summary of Changes Made

End the review with a clear list of every file you modified or created:

### Project File Updates

| File | Action | What Changed |
|------|--------|-------------|
| `<plan file>` | Updated / No change | Brief description |
| `<project folder>/XX-name.md` | Updated / Created | Brief description |
| `<project folder>/README.md` | Updated / No change | Brief description |

If no changes were needed, explicitly state: "No plan or ticket updates required — implementation is fully aligned."
