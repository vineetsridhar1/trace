import { ipcMain } from "electron";
import {
  checkWorktreeExists,
  commitWorktreeChanges,
  deleteWorktree,
  mergeWorktree,
  getWorktreePath,
  getWorktreeBranch,
} from "../worktree";
import { getWorktreeDiff } from "../diff";
import { registerRelayAction } from "../instanceCommandHandler";

const DELETE_WORKTREE_CHANNEL = "delete-worktree";
const CHECK_WORKTREE_CHANNEL = "check-worktree";
const MERGE_WORKTREE_CHANNEL = "merge-worktree";
const COMMIT_WORKTREE_CHANGES_CHANNEL = "commit-worktree-changes";
const GET_WORKTREE_DIFF_CHANNEL = "get-worktree-diff";
const GET_WORKTREE_BRANCH_CHANNEL = "get-worktree-branch";

export function registerWorktreeHandlers(): void {
  ipcMain.removeHandler(DELETE_WORKTREE_CHANNEL);
  ipcMain.handle(
    DELETE_WORKTREE_CHANNEL,
    async (_event, workspaceId: string, repoPath: string, teardownCommands?: string[]) => {
      try {
        const result = await deleteWorktree(workspaceId, repoPath, teardownCommands);
        return { success: true, ...result };
      } catch (err) {
        console.error("Failed to delete worktree:", err);
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(CHECK_WORKTREE_CHANNEL);
  ipcMain.handle(
    CHECK_WORKTREE_CHANNEL,
    async (_event, workspaceId: string, repoPath: string) => {
      try {
        const result = await checkWorktreeExists(workspaceId, repoPath);
        return { success: true, ...result };
      } catch (err) {
        return { success: false, exists: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(MERGE_WORKTREE_CHANNEL);
  ipcMain.handle(
    MERGE_WORKTREE_CHANNEL,
    async (
      _event,
      workspaceId: string,
      repoPath: string,
      baseBranch: string,
    ) => {
      try {
        const result = await mergeWorktree(workspaceId, repoPath, baseBranch);
        return { success: true, ...result };
      } catch (err) {
        console.error("Failed to merge worktree:", err);
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(COMMIT_WORKTREE_CHANGES_CHANNEL);
  ipcMain.handle(
    COMMIT_WORKTREE_CHANGES_CHANNEL,
    async (_event, workspaceId: string) => {
      try {
        const result = await commitWorktreeChanges(workspaceId);
        return { success: true, ...result };
      } catch (err) {
        return { success: false, committed: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(GET_WORKTREE_DIFF_CHANNEL);
  ipcMain.handle(
    GET_WORKTREE_DIFF_CHANNEL,
    async (_event, workspaceId: string, baseBranch: string) => {
      try {
        const worktreePath = getWorktreePath(workspaceId);
        const result = await getWorktreeDiff(
          worktreePath,
          baseBranch || "main",
        );
        return { success: true, ...result };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(GET_WORKTREE_BRANCH_CHANNEL);
  ipcMain.handle(
    GET_WORKTREE_BRANCH_CHANNEL,
    async (_event, workspaceId: string) => {
      try {
        const branch = await getWorktreeBranch(workspaceId);
        return { success: true, branch };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );
}

export function registerWorktreeRelayActions(): void {
  registerRelayAction("deleteWorktree", async (params) => {
    const { workspaceId, repoPath, teardownCommands } = params as {
      workspaceId: string;
      repoPath: string;
      teardownCommands?: string[];
    };
    const result = await deleteWorktree(workspaceId, repoPath, teardownCommands);
    return { success: true, ...result };
  });

  registerRelayAction("checkWorktreeExists", async (params) => {
    const { workspaceId, repoPath } = params as {
      workspaceId: string;
      repoPath: string;
    };
    const result = await checkWorktreeExists(workspaceId, repoPath);
    return { success: true, ...result };
  });

  registerRelayAction("mergeWorktree", async (params) => {
    const { workspaceId, repoPath, baseBranch } = params as {
      workspaceId: string;
      repoPath: string;
      baseBranch: string;
    };
    const result = await mergeWorktree(workspaceId, repoPath, baseBranch);
    return { success: true, ...result };
  });

  registerRelayAction("commitWorktreeChanges", async (params) => {
    const { workspaceId } = params as { workspaceId: string };
    const result = await commitWorktreeChanges(workspaceId);
    return { success: true, ...result };
  });

  registerRelayAction("getWorktreeDiff", async (params) => {
    const { workspaceId, baseBranch } = params as {
      workspaceId: string;
      baseBranch: string;
    };
    const worktreePath = getWorktreePath(workspaceId);
    const result = await getWorktreeDiff(worktreePath, baseBranch || "main");
    return { success: true, ...result };
  });

  registerRelayAction("getWorktreeBranch", async (params) => {
    const { workspaceId } = params as { workspaceId: string };
    const branch = await getWorktreeBranch(workspaceId);
    return { success: true, branch };
  });
}
