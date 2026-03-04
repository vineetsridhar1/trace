import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ipcMain } from "electron";
import { runProcess } from "../process";
import { getMainWindow } from "./shared";

const LIST_REPO_BRANCHES_CHANNEL = "list-repo-branches";
const CHECK_BRANCHES_MERGED_CHANNEL = "check-branches-merged";
const WATCH_BASE_BRANCH_CHANNEL = "watch-base-branch";
const UNWATCH_BASE_BRANCH_CHANNEL = "unwatch-base-branch";
const CHECK_MAIN_STATUS_CHANNEL = "check-main-status";
const PULL_MAIN_CHANNEL = "pull-main";
const CREATE_GIT_BRANCH_CHANNEL = "create-git-branch";

let branchWatchers: fs.FSWatcher[] = [];

export function registerGitHandlers(): void {
  ipcMain.removeHandler(LIST_REPO_BRANCHES_CHANNEL);
  ipcMain.handle(
    LIST_REPO_BRANCHES_CHANNEL,
    async (_event, repoPath: string) => {
      try {
        const result = await runProcess(
          "git",
          ["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
          repoPath,
        );
        if (result.code !== 0) {
          return { success: false, branches: [], error: result.stderr };
        }
        const branches = result.stdout
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean);
        return { success: true, branches };
      } catch (err) {
        return { success: false, branches: [], error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(CHECK_BRANCHES_MERGED_CHANNEL);
  ipcMain.handle(
    CHECK_BRANCHES_MERGED_CHANNEL,
    async (
      _event,
      repoPath: string,
      targets: Array<{ workspaceId: string; branch: string }>,
      baseBranch: string,
    ) => {
      try {
        // Fetch the latest remote refs so we can detect merges done on GitHub.
        await runProcess(
          "git",
          ["fetch", "origin", baseBranch],
          repoPath,
        ).catch((): void => {});

        const merged: Record<string, boolean> = {};
        for (const { workspaceId, branch } of targets) {
          try {
            // `git diff <base>...<branch>` shows changes on <branch> that aren't
            // in <base>. If empty, all the branch's changes are already in the
            // base — regardless of merge strategy (FF, squash, rebase).
            const diff = await runProcess(
              "git",
              ["diff", "--quiet", `${baseBranch}...${branch}`],
              repoPath,
            );
            if (diff.code === 0) {
              merged[workspaceId] = true;
              continue;
            }

            // Also check against the fetched remote ref.
            const remoteDiff = await runProcess(
              "git",
              ["diff", "--quiet", `origin/${baseBranch}...${branch}`],
              repoPath,
            );
            merged[workspaceId] = remoteDiff.code === 0;
          } catch {
            merged[workspaceId] = false;
          }
        }
        return { success: true, merged };
      } catch (err) {
        return { success: false, merged: {}, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(WATCH_BASE_BRANCH_CHANNEL);
  ipcMain.handle(
    WATCH_BASE_BRANCH_CHANNEL,
    (_event, repoPath: string, baseBranch: string) => {
      // Close any existing watchers
      for (const w of branchWatchers) w.close();
      branchWatchers = [];

      const gitDir = path.join(repoPath, ".git");
      // Watch directories (not specific files) so we catch newly-created refs
      // e.g. after the first `git fetch` creates refs/remotes/origin/main
      const watchPaths = [
        path.join(gitDir, "refs", "heads"),
        path.join(gitDir, "refs", "remotes", "origin"),
        path.join(gitDir, "packed-refs"),
      ];

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const notify = (_eventType: string, filename: string | null) => {
        // For directories, only fire when the base branch file changes
        // For packed-refs (a file), always fire
        if (filename && filename !== baseBranch && filename !== "packed-refs")
          return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("base-branch-changed");
          }
        }, 500);
      };

      for (const watchPath of watchPaths) {
        try {
          if (fs.existsSync(watchPath)) {
            const watcher = fs.watch(watchPath, notify);
            watcher.on("error", (err) => {
              void err; // Ignore watch errors
            });
            branchWatchers.push(watcher);
          }
        } catch {
          // Path doesn't exist or can't be watched — skip
        }
      }
      return { success: true };
    },
  );

  ipcMain.removeHandler(UNWATCH_BASE_BRANCH_CHANNEL);
  ipcMain.handle(UNWATCH_BASE_BRANCH_CHANNEL, () => {
    for (const w of branchWatchers) w.close();
    branchWatchers = [];
    return { success: true };
  });

  ipcMain.removeHandler(CHECK_MAIN_STATUS_CHANNEL);
  ipcMain.handle(
    CHECK_MAIN_STATUS_CHANNEL,
    async (_event, repoPath: string, baseBranch: string) => {
      try {
        // Fetch latest remote refs
        const fetchResult = await runProcess(
          "git",
          ["fetch", "origin", baseBranch],
          repoPath,
        );
        if (fetchResult.code !== 0) {
          return {
            success: false,
            error: `Failed to fetch: ${fetchResult.stderr.trim()}`,
          };
        }

        // Compare local base branch with remote
        const localRef = await runProcess(
          "git",
          ["rev-parse", baseBranch],
          repoPath,
        );
        const remoteRef = await runProcess(
          "git",
          ["rev-parse", `origin/${baseBranch}`],
          repoPath,
        );

        if (localRef.code !== 0 || remoteRef.code !== 0) {
          return { success: false, error: "Failed to resolve branch refs" };
        }

        const localSha = localRef.stdout.trim();
        const remoteSha = remoteRef.stdout.trim();
        const isUpToDate = localSha === remoteSha;

        // Count how many commits behind and get their details
        let commitsBehind = 0;
        let commits: {
          hash: string;
          author: string;
          message: string;
          date: string;
        }[] = [];
        if (!isUpToDate) {
          const countResult = await runProcess(
            "git",
            ["rev-list", "--count", `${baseBranch}..origin/${baseBranch}`],
            repoPath,
          );
          if (countResult.code === 0) {
            commitsBehind = parseInt(countResult.stdout.trim(), 10) || 0;
          }

          // Fetch commit details (limit to 20 for the popover)
          const logResult = await runProcess(
            "git",
            [
              "log",
              `${baseBranch}..origin/${baseBranch}`,
              "--pretty=format:%h%x00%an%x00%s%x00%ar",
              "-20",
            ],
            repoPath,
          );
          if (logResult.code === 0 && logResult.stdout.trim()) {
            commits = logResult.stdout
              .trim()
              .split("\n")
              .map((line) => {
                const [hash, author, message, date] = line.split("\0");
                return { hash, author, message, date };
              });
          }
        }

        return {
          success: true,
          isUpToDate,
          commitsBehind,
          commits,
          localSha,
          remoteSha,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(PULL_MAIN_CHANNEL);
  ipcMain.handle(
    PULL_MAIN_CHANNEL,
    async (_event, repoPath: string, baseBranch: string) => {
      try {
        // Fetch latest from remote
        const fetchResult = await runProcess(
          "git",
          ["fetch", "origin", baseBranch],
          repoPath,
        );
        if (fetchResult.code !== 0) {
          return {
            success: false,
            error: `Failed to fetch: ${fetchResult.stderr.trim()}`,
          };
        }

        // Fast-forward the local branch to match remote, updating the
        // index and working tree so the repo stays clean.
        const mergeResult = await runProcess(
          "git",
          ["merge", "--ff-only", `origin/${baseBranch}`],
          repoPath,
        );
        if (mergeResult.code !== 0) {
          return {
            success: false,
            error: `Failed to merge: ${mergeResult.stderr.trim()}`,
          };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(CREATE_GIT_BRANCH_CHANNEL);
  ipcMain.handle(
    CREATE_GIT_BRANCH_CHANNEL,
    async (_event, repoPath: string, branchName: string, baseBranch: string, scopingDocsPath?: string) => {
      try {
        // Validate branch names to prevent injection
        const branchRe = /^[a-zA-Z0-9._\-/]+$/;
        if (!branchRe.test(branchName)) {
          return { success: false, error: `Invalid branch name: ${branchName}` };
        }
        if (!branchRe.test(baseBranch)) {
          return { success: false, error: `Invalid base branch: ${baseBranch}` };
        }

        execFileSync("git", ["fetch", "origin", baseBranch], { cwd: repoPath, stdio: "pipe" });
        execFileSync("git", ["branch", branchName, `origin/${baseBranch}`], { cwd: repoPath, stdio: "pipe" });

        // If scoping docs exist, commit them to the new branch
        if (scopingDocsPath && fs.existsSync(scopingDocsPath)) {
          const tmpDir = path.join(os.tmpdir(), `trace-project-${Date.now()}`);
          try {
            execFileSync("git", ["worktree", "add", tmpDir, branchName], { cwd: repoPath, stdio: "pipe" });
            const destTrace = path.join(tmpDir, ".trace");
            fs.mkdirSync(destTrace, { recursive: true });
            const files = fs.readdirSync(scopingDocsPath);
            for (const file of files) {
              const src = path.join(scopingDocsPath, file);
              if (fs.statSync(src).isFile()) {
                fs.copyFileSync(src, path.join(destTrace, file));
              }
            }
            execFileSync("git", ["add", ".trace"], { cwd: tmpDir, stdio: "pipe" });
            execFileSync("git", ["commit", "-m", "Add project scoping documents"], { cwd: tmpDir, stdio: "pipe" });
            execFileSync("git", ["worktree", "remove", tmpDir], { cwd: repoPath, stdio: "pipe" });
          } catch (worktreeErr) {
            try { execFileSync("git", ["worktree", "remove", tmpDir, "--force"], { cwd: repoPath, stdio: "pipe" }); } catch { /* ignore cleanup */ }
            console.error("[create-git-branch] Failed to commit scoping docs:", worktreeErr);
          }
        }

        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );
}
