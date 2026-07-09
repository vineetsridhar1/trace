-- Enforce at most one active session group per adopted worktree, closing the
-- TOCTOU gap in the service-layer "already imported" check. Scoped to adopted,
-- non-deleted, non-archived groups so historical/archived rows never collide.
CREATE UNIQUE INDEX "SessionGroup_active_adopted_worktree_key"
  ON "SessionGroup" ("organizationId", "repoId", "workdir")
  WHERE "worktreeAdopted" AND NOT "worktreeDeleted" AND "archivedAt" IS NULL;
