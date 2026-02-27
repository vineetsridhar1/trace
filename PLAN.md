# Status System Migration Plan

## Summary

Overhaul the workspace status system to:
1. Remove the auto-review feature entirely
2. Make "completed" a visual sub-state of "in progress" (check mark instead of spinner)
3. Add a "review" status driven by GitHub PR existence
4. Keep "merged" status but now driven by GitHub PR merge state
5. Integrate the GitHub login branch to enable GitHub API access

## New Status Flow

```
pending → creation → in_progress → completed → review → merged
              ↕           ↕            ↕
            queued    needs_input   in_progress (resume)
```

- **in_progress**: Claude is actively working (spinner)
- **completed**: Claude finished (check mark, grouped with in_progress visually)
- **review**: A GitHub PR exists for this workspace's branch (new!)
- **merged**: The GitHub PR has been merged (now PR-driven instead of git-diff-driven)

## Phase 1: Merge GitHub Login Branch

Cherry-pick commits from `trace/add-github-login` (worktree `d72f019c`) into this branch. Key additions:
- `server/src/services/authService.ts` — OAuth token exchange, JWT
- `server/src/routes/auth.ts` — `/auth/github` and `/auth/github/callback`
- `server/src/schema/auth/` — `me` query
- `src/context/AuthContext.tsx` — React auth context
- `src/components/LoginScreen.tsx` — Login UI
- `src/renderer.tsx` — AuthGate wrapper
- `src/graphql/client.ts` — Auth link for Apollo
- `src/main/ipc.ts` — `github-login` IPC handler
- `src/preload.ts` — `githubLogin` bridge
- `server/src/config.ts` — GitHub OAuth config vars
- `server/prisma/schema.prisma` — `githubId` on User model
- Migration: `20260227120000_add_github_auth`

### Modifications on top of the cherry-pick:
1. **Store GitHub access token on User model**: Add `githubAccessToken` field to User in schema.prisma + a migration. Save it during OAuth callback in `authService.ts`.
2. **Add `repo` OAuth scope**: Change scope from `user:email` to `user:email,repo` in `auth.ts` route to allow reading PRs.

## Phase 2: Remove Auto-Review System

### 2a. Server — `eventService.ts`
- In `runAutoCompleteIfNeeded()`: when `repoWriteCount > 0`, go straight to `completed` instead of `auto_review`. Remove the entire auto_review→completed transition block. Remove the `WORKSPACE_READY_FOR_REVIEW` publish and the `AutoReview` event creation.

### 2b. Server — Status Transitions (`updateWorkspaceStatus.ts`)
- Remove `auto_review` from `VALID_STATUSES` and `STATUS_TRANSITIONS`.
- Add `review` to `VALID_STATUSES`.
- New transitions:
  ```
  in_progress: ['completed', 'needs_input']     // removed auto_review
  completed:   ['review', 'merged', 'in_progress']  // added review
  review:      ['merged', 'in_progress']         // new state
  ```

### 2c. Server — PubSub (`pubsub.ts`)
- Remove `WORKSPACE_READY_FOR_REVIEW` topic.

### 2d. Server — GraphQL Subscription Schema
- Remove `workspaceReadyForReview` subscription definition and resolver.

### 2e. Frontend — `useChannelSubscriptions.ts`
- Remove the `WORKSPACE_READY_FOR_REVIEW_SUBSCRIPTION` gql definition.
- Remove the `onWorkspaceReadyForReview` callback prop and its useSubscription/useEffect.

### 2f. Frontend — `App.tsx`
- Remove `autoReviewRef` and the `onWorkspaceReadyForReview` callback passed to `useChannelSubscriptions`.
- Remove the `autoReviewWorkspace` call setup in useEffect.

### 2g. Frontend — `useClaudeMessageActions.ts`
- Remove the `autoReviewWorkspace` function entirely.

### 2h. Frontend — `AutoReviewDivider.tsx`
- Delete this component.
- Remove the `AutoReview` hookEventName check in `ThreadEvent.tsx`.

### 2i. Type Definition — `src/types.ts`
- Change `TicketStatus`: replace `'auto_review'` with `'review'`.

### 2j. Database Migration
- Add migration to convert any existing `auto_review` status rows to `completed`.

## Phase 3: Frontend Status Display Changes

### 3a. "Completed" is now visually part of "In Progress"

**`MessageItem.tsx`:**
- `STATUS_CONFIG`: Change `completed` to use blue color scheme (same family as in_progress) but distinct — perhaps keep green check.
- `STATUS_GROUP_ORDER`: Remove `completed` as a separate group.
- `ACTIVE_STATUSES`: Keep as `['in_progress', 'creation']` (no auto_review).
- `DONE_STATUSES`: `['completed']` — gets check mark, displayed in the in_progress group.

**`MessagePanel.tsx`:**
- Modify grouping logic so `completed` workspaces are merged into the `in_progress` group instead of having their own section.

**`ThreadHeader.tsx`:**
- Update `HEADER_STATUS_CONFIG`: remove `auto_review`, add `review`.
- `completed` → label "Done", keep green/blue styling.

**`TicketView.tsx`:**
- Same: remove `auto_review`, add `review`, update `completed` label/style.

### 3b. New "Review" status display
- Color: teal (reuse the old auto_review color since it's review-related)
- Label: "In Review"
- Icon: `FiGitPullRequest` from `react-icons/fi`
- Appears as its own group in the sidebar between in_progress and merged.

### 3c. Update "Merged" status icon
- Show `FiGitMerge` icon for merged workspaces (already imported in ThreadHeader).

## Phase 4: GitHub PR Polling

### 4a. Server — New `githubService.ts`
Create a service with:
```typescript
async function checkPRsForBranches(
  githubAccessToken: string,
  repoOwner: string,
  repoName: string,
  branches: string[]
): Promise<Record<string, { hasPR: boolean; merged: boolean; prUrl?: string }>>
```
Uses GitHub REST API: `GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=all`

### 4b. Server — New GraphQL Query
```graphql
type PRStatus {
  branch: String!
  hasPR: Boolean!
  merged: Boolean!
  prUrl: String
}

extend type Query {
  checkPRStatuses(channelId: ID!, branches: [String!]!): [PRStatus!]!
}
```
The resolver:
1. Gets the channel's `githubUrl`, parses owner/repo
2. Gets the authenticated user's GitHub access token from DB
3. Calls `checkPRsForBranches()`
4. Returns results

### 4c. Frontend — New `usePRPolling.ts` Hook
Similar to `useMergePolling.ts`:
- Polls every 30 seconds
- Finds workspaces with `completed` or `review` status that have a branch
- Calls `checkPRStatuses` GraphQL query
- Updates workspace status:
  - `completed` + hasPR → `review`
  - `review` + merged → `merged`
  - `review` + !hasPR → back to `completed` (PR was closed/deleted)

### 4d. Replace `useMergePolling.ts`
The existing merge polling (git diff-based) is replaced by the new PR polling. Remove `useMergePolling` and its IPC infrastructure (`checkBranchesMerged`, `watchBaseBranch`, etc.) since PR merge state is now the source of truth.

## Phase 5: Run `make gql`

After all schema changes, regenerate GraphQL types and hooks.

## Implementation Order

1. Phase 1: Cherry-pick GitHub login branch
2. Phase 2: Remove auto-review system (server + frontend)
3. Phase 3: Update frontend status display
4. Phase 4: Add GitHub PR polling
5. Phase 5: `make gql` and verify
