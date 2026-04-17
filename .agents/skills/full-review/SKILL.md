---
name: full-review
description: Use when user says "full review", "review PR" "review code", "code review", or invokes /full-review — performs a senior staff engineer-level review of the current PR against industry standards, architecture, and project plans
allowed-tools: Bash, Read, Grep, Glob, Edit, Agent, Write
---

# Senior Staff Engineer Code Review

You are acting as a **senior staff engineer** performing a thorough code review.
Your review must be rigorous, honest, and actionable. You hold code to the highest
industry standards — the kind of review that prevents production incidents, catches
architectural drift, and keeps the codebase maintainable at scale.

## Step 1: Gather Context

1. Read `AGENTS.md` at the project root to understand architecture rules and design principles
2. Read `plan.md` at the project root (if it exists) to understand the intended implementation plan
3. Determine the current branch and base branch:
   ```
   git branch --show-current
   git log --oneline main..HEAD
   ```
4. Get the full diff against the base branch:
   ```
   git diff main...HEAD
   ```
5. Get list of changed files:
   ```
   git diff --name-only main...HEAD
   ```
6. Read every changed file in full — you need complete context, not just the diff

## Step 2: Review Against Plan

If `plan.md` exists, evaluate:

- **Completeness**: Are all planned items implemented? Flag anything missing
- **Scope creep**: Is there work done that wasn't in the plan? Flag additions that weren't planned
- **Deviations**: Does the implementation deviate from the planned approach? Are deviations justified?
- **Ordering**: Were dependencies respected? Were things built in the right order?

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
  - Events are the source of truth (no mutation result reads)
  - Service layer owns business logic (no logic in resolvers)
  - Agents are first-class citizens (same service layer as humans)
  - Flat entity model (no unnecessary nesting)
  - Pluggable adapters (no vendor lock-in)
- **Separation of concerns**: Is business logic in the right layer? Are components focused?
- **API design**: Are interfaces clean, consistent, and hard to misuse?
- **Data modeling**: Are schemas correct? Any denormalization issues? Missing indexes?
- **State management**: Does it follow the Zustand-only rule? No useState for shared state?
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

## Step 9: Compile the Review

Present your findings in this structured format:

### Review Summary

One paragraph overall assessment. Is this PR ready to ship? What's the overall quality level?

### Approach Review

Is the fundamental design sound? Is there a simpler way? Are there multiple sources of truth that should be collapsed? If the approach is wrong, say so directly and describe the better alternative — this takes priority over everything else in the review.

### Critical Issues (must fix before merge)

Issues that would cause bugs, security vulnerabilities, data loss, or architectural violations. **A flawed fundamental approach counts as a critical issue** — if the design is wrong, flag it here even if the implementation is technically correct.

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

### Plan Alignment

Summary of how well the implementation matches plan.md. Note any gaps or deviations.

### Architecture Alignment

Summary of how well the code follows AGENTS.md principles. Note any drift.

## Step 10: Update Project Files (if needed)

Only if the review reveals **drastic findings** that affect the project going forward:

- **Update `plan.md`**: If the plan is missing steps that this PR revealed are necessary,
  or if planned items turned out to be infeasible and the plan needs adjustment
- **Update `AGENTS.md`**: If the review uncovered a recurring pattern that should become
  a project rule, or if an existing rule is unclear and led to a violation

Do NOT update these files for minor issues. Only update when there's a genuine gap
in project documentation that led to or could lead to architectural problems.

If you update either file, note what changed and why at the end of your review under
a **Project File Updates** heading.
