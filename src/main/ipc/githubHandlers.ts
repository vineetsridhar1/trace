import { ipcMain, BrowserWindow } from "electron";
import {
  ensureWorktreeForBranch,
  pushWorktreeBranch,
  ensureWorktreeFromRemote,
} from "../worktree";
import { runProcess } from "../process";
import { resolveServerUrl } from "./shared";

const GITHUB_LOGIN_CHANNEL = "github-login";
const DETECT_INSTALLED_APPS_CHANNEL = "detect-installed-apps";
const OPEN_IN_APP_CHANNEL = "open-in-app";
const CHECK_GH_AUTH_CHANNEL = "check-gh-auth";
const PUSH_WORKTREE_BRANCH_CHANNEL = "push-worktree-branch";
const ENSURE_WORKTREE_FROM_REMOTE_CHANNEL = "ensure-worktree-from-remote";
const CHECK_PR_STATUSES_LOCAL_CHANNEL = "check-pr-statuses-local";
const CHECK_PR_CI_LOCAL_CHANNEL = "check-pr-ci-local";
const LIST_PULL_REQUESTS_CHANNEL = "list-pull-requests";
const CHECKOUT_PULL_REQUEST_CHANNEL = "checkout-pull-request";

// Curated allow-list of dev tools we show in the "Open In" menu.
// Maps bundle identifier → { id, label, openArgs } used by the open-in-app handler.
const ALLOWED_APPS: Record<
  string,
  { id: string; label: string; openArgs: string[] }
> = {
  "com.apple.finder": { id: "finder", label: "Finder", openArgs: [] },
  "com.todesktop.230313mzl4w4u92": {
    id: "cursor",
    label: "Cursor",
    openArgs: ["-a", "Cursor"],
  },
  "com.microsoft.VSCode": {
    id: "vscode",
    label: "VS Code",
    openArgs: ["-a", "Visual Studio Code"],
  },
  "com.googlecode.iterm2": {
    id: "iterm",
    label: "iTerm",
    openArgs: ["-a", "iTerm"],
  },
  "com.apple.Terminal": {
    id: "terminal",
    label: "Terminal",
    openArgs: ["-a", "Terminal"],
  },
};

// Display order for the menu
const APP_DISPLAY_ORDER = ["finder", "cursor", "vscode", "iterm", "terminal"];

// Module-level cache so we only query Launch Services once per app lifetime
let installedAppsCache: Array<{ id: string; label: string }> | null = null;

// Cache gh CLI auth status with TTL
let ghAuthCache: { available: boolean; checkedAt: number } | null = null;
const GH_AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function registerGithubHandlers(): void {
  ipcMain.removeHandler(GITHUB_LOGIN_CHANNEL);
  ipcMain.handle(GITHUB_LOGIN_CHANNEL, async () => {
    const serverUrl = resolveServerUrl();
    return new Promise<{
      success: boolean;
      token?: string;
      user?: unknown;
      error?: string;
    }>((resolve) => {
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(`${serverUrl}/auth/github`);

      // GitHub's OAuth app has a fixed redirect URI (e.g. localhost:3100) but
      // the backend may run on a different port. Intercept the callback and
      // rewrite it to the actual server URL.  We listen on both events:
      //   - will-navigate: client-side navigations (link clicks, window.location)
      //   - will-redirect: server-side HTTP 302 redirects (GitHub's OAuth redirect)
      const rewriteCallback = (event: Electron.Event, url: string) => {
        if (url.includes("/auth/github/callback")) {
          if (!url.startsWith(serverUrl)) {
            event.preventDefault();
            const callbackUrl = new URL(url);
            const rewritten = `${serverUrl}${callbackUrl.pathname}${callbackUrl.search}`;
            console.log(
              `[auth] Rewriting OAuth callback: ${url} → ${rewritten}`,
            );
            authWindow.loadURL(rewritten);
          } else {
            console.log(
              `[auth] OAuth callback already targets correct server: ${url}`,
            );
          }
        }
      };
      authWindow.webContents.on("will-navigate", rewriteCallback);
      authWindow.webContents.on("will-redirect", rewriteCallback);

      authWindow.webContents.on("did-navigate", async (_event, url) => {
        if (url.includes("/auth/github/callback")) {
          try {
            const result = await authWindow.webContents.executeJavaScript(`
              (function() {
                var tokenMeta = document.querySelector('meta[name="trace-token"]');
                var userMeta = document.querySelector('meta[name="trace-user"]');
                if (tokenMeta) {
                  return {
                    token: tokenMeta.getAttribute('content'),
                    user: userMeta ? JSON.parse(userMeta.getAttribute('content')) : null,
                  };
                }
                return null;
              })();
            `);

            if (result?.token) {
              authWindow.close();
              resolve({
                success: true,
                token: result.token,
                user: result.user,
              });
            } else {
              authWindow.close();
              resolve({ success: false, error: "No token found in response" });
            }
          } catch (err) {
            authWindow.close();
            resolve({ success: false, error: String(err) });
          }
        }
      });

      authWindow.on("closed", () => {
        resolve({ success: false, error: "Window closed by user" });
      });
    });
  });

  ipcMain.removeHandler(DETECT_INSTALLED_APPS_CHANNEL);
  ipcMain.handle(DETECT_INSTALLED_APPS_CHANNEL, async () => {
    if (installedAppsCache) {
      return { success: true, apps: installedAppsCache };
    }
    try {
      const allowedBundleIds = Object.keys(ALLOWED_APPS);
      // Use NSWorkspace.URLForApplicationWithBundleIdentifier to check each app.
      // This queries the Launch Services database directly — fast and always up-to-date.
      const jxaScript = `
ObjC.import('AppKit');
var ws = $.NSWorkspace.sharedWorkspace;
var ids = ${JSON.stringify(allowedBundleIds)};
var found = [];
for (var i = 0; i < ids.length; i++) {
  var url = ws.URLForApplicationWithBundleIdentifier(ids[i]);
  if (url && url.path) {
    found.push(ids[i]);
  }
}
JSON.stringify(found);
`;
      const result = await runProcess(
        "osascript",
        ["-l", "JavaScript", "-"],
        "/",
        jxaScript,
      );
      if (result.code === 0 && result.stdout.trim()) {
        const foundBundleIds: string[] = JSON.parse(result.stdout.trim());
        const apps = allowedBundleIds
          .filter((bid) => foundBundleIds.includes(bid))
          .map((bid) => ({
            id: ALLOWED_APPS[bid].id,
            label: ALLOWED_APPS[bid].label,
          }));
        // Sort by display order
        apps.sort(
          (a, b) =>
            APP_DISPLAY_ORDER.indexOf(a.id) - APP_DISPLAY_ORDER.indexOf(b.id),
        );
        installedAppsCache = apps;
        return { success: true, apps };
      }
      // Fallback: assume at least Finder and Terminal (don't cache so it retries next time)
      const fallback = [
        { id: "finder", label: "Finder" },
        { id: "terminal", label: "Terminal" },
      ];
      return { success: true, apps: fallback };
    } catch (err) {
      const fallback = [
        { id: "finder", label: "Finder" },
        { id: "terminal", label: "Terminal" },
      ];
      return { success: false, apps: fallback, error: String(err) };
    }
  });

  ipcMain.removeHandler(OPEN_IN_APP_CHANNEL);
  ipcMain.handle(
    OPEN_IN_APP_CHANNEL,
    async (_event, appId: string, targetPath: string) => {
      try {
        const appEntry = Object.values(ALLOWED_APPS).find(
          (a) => a.id === appId,
        );
        if (!appEntry) {
          return { success: false, error: `Unknown app: ${appId}` };
        }
        const args = [...appEntry.openArgs, targetPath];
        const result = await runProcess("open", args, targetPath);
        return {
          success: result.code === 0,
          error: result.code !== 0 ? result.stderr : undefined,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(CHECK_GH_AUTH_CHANNEL);
  ipcMain.handle(CHECK_GH_AUTH_CHANNEL, async () => {
    // Return cached result if still fresh
    if (ghAuthCache && Date.now() - ghAuthCache.checkedAt < GH_AUTH_CACHE_TTL) {
      return { success: true, available: ghAuthCache.available };
    }
    try {
      const result = await runProcess(
        "gh",
        ["auth", "status", "--hostname", "github.com"],
        "/",
      );
      const available = result.code === 0;
      ghAuthCache = { available, checkedAt: Date.now() };
      return { success: true, available };
    } catch {
      // gh not installed (ENOENT) or other error
      ghAuthCache = { available: false, checkedAt: Date.now() };
      return { success: true, available: false };
    }
  });

  ipcMain.removeHandler(PUSH_WORKTREE_BRANCH_CHANNEL);
  ipcMain.handle(
    PUSH_WORKTREE_BRANCH_CHANNEL,
    async (_event, workspaceId: string, repoPath: string) => {
      try {
        return await pushWorktreeBranch(workspaceId, repoPath);
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(ENSURE_WORKTREE_FROM_REMOTE_CHANNEL);
  ipcMain.handle(
    ENSURE_WORKTREE_FROM_REMOTE_CHANNEL,
    async (
      _event,
      workspaceId: string,
      repoPath: string,
      branchName: string,
    ) => {
      try {
        return await ensureWorktreeFromRemote(
          workspaceId,
          repoPath,
          branchName,
        );
      } catch (err) {
        return { success: false, worktreePath: "", error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(CHECK_PR_STATUSES_LOCAL_CHANNEL);
  ipcMain.handle(
    CHECK_PR_STATUSES_LOCAL_CHANNEL,
    async (_event, repoPath: string, branches: string[]) => {
      try {
        // Single CLI call to fetch all PRs in the repo
        const result = await runProcess(
          "gh",
          [
            "pr",
            "list",
            "--state",
            "all",
            "--json",
            "state,url,headRefName",
            "--limit",
            "100",
          ],
          repoPath,
        );

        if (result.code !== 0) {
          return {
            success: true,
            statuses: branches.map((branch) => ({
              branch,
              state: "none" as const,
              prUrl: null as string | null,
            })),
          };
        }

        const prs = JSON.parse(result.stdout.trim() || "[]") as Array<{
          state: string;
          url: string;
          headRefName: string;
        }>;

        // Build a map from branch name to its most recent PR (first match,
        // since results are ordered newest-first)
        const prByBranch = new Map<string, { state: string; url: string }>();
        for (const pr of prs) {
          if (!prByBranch.has(pr.headRefName)) {
            prByBranch.set(pr.headRefName, pr);
          }
        }

        const statuses = branches.map((branch) => {
          const pr = prByBranch.get(branch);
          if (!pr) {
            return {
              branch,
              state: "none" as const,
              prUrl: null as string | null,
            };
          }
          const state =
            pr.state === "MERGED"
              ? ("merged" as const)
              : pr.state === "OPEN"
                ? ("open" as const)
                : ("closed" as const);
          return { branch, state, prUrl: pr.url || null };
        });

        return { success: true, statuses };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(CHECK_PR_CI_LOCAL_CHANNEL);
  ipcMain.handle(
    CHECK_PR_CI_LOCAL_CHANNEL,
    async (_event, repoPath: string, branches: string[]) => {
      const emptyCIStatus = (branch: string) => ({
        branch,
        total: 0,
        passed: 0,
        failed: 0,
        pending: 0,
      });

      if (branches.length === 0) {
        return { success: true, statuses: [] };
      }

      try {
        // Get owner/repo from git remote (local git call, no API)
        const remoteResult = await runProcess(
          "git",
          ["remote", "get-url", "origin"],
          repoPath,
        );
        if (remoteResult.code !== 0) {
          return {
            success: true,
            statuses: branches.map(emptyCIStatus),
          };
        }

        const remoteUrl = remoteResult.stdout.trim();
        const match = remoteUrl.match(/(?:github\.com)[/:]([^/]+)\/([^/.]+)/);
        if (!match) {
          return {
            success: true,
            statuses: branches.map(emptyCIStatus),
          };
        }
        const [, owner, repo] = match;

        // Build a single GraphQL query with aliased fields per branch
        const aliasedFields = branches
          .map((branch, i) => {
            const alias = `pr_${i}`;
            const escapedBranch = branch
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"');
            return `${alias}: pullRequests(headRefName: "${escapedBranch}", first: 1, states: OPEN) {
              nodes {
                commits(last: 1) {
                  nodes {
                    commit {
                      statusCheckRollup {
                        contexts(first: 100) {
                          nodes {
                            ... on CheckRun {
                              __typename
                              conclusion
                              status
                            }
                            ... on StatusContext {
                              __typename
                              state
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }`;
          })
          .join("\n");

        const safeOwner = owner!.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const safeName = repo!.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const query = `query { repository(owner: "${safeOwner}", name: "${safeName}") { ${aliasedFields} } }`;

        const graphqlResult = await runProcess(
          "gh",
          ["api", "graphql", "-f", `query=${query}`],
          repoPath,
        );

        if (graphqlResult.code !== 0) {
          return {
            success: true,
            statuses: branches.map(emptyCIStatus),
          };
        }

        const data = JSON.parse(graphqlResult.stdout.trim());
        const repoData = data?.data?.repository;
        if (!repoData) {
          return {
            success: true,
            statuses: branches.map(emptyCIStatus),
          };
        }

        const statuses = branches.map((branch, i) => {
          const alias = `pr_${i}`;
          const prNodes = repoData[alias]?.nodes;
          if (!prNodes || prNodes.length === 0) {
            return emptyCIStatus(branch);
          }

          const commitNodes = prNodes[0]?.commits?.nodes;
          if (!commitNodes || commitNodes.length === 0) {
            return emptyCIStatus(branch);
          }

          const contexts =
            commitNodes[0]?.commit?.statusCheckRollup?.contexts?.nodes || [];

          let passed = 0;
          let failed = 0;
          let pending = 0;

          for (const ctx of contexts) {
            if (ctx.__typename === "CheckRun") {
              if (ctx.status !== "COMPLETED") {
                pending++;
              } else if (
                ctx.conclusion === "SUCCESS" ||
                ctx.conclusion === "NEUTRAL" ||
                ctx.conclusion === "SKIPPED"
              ) {
                passed++;
              } else {
                failed++;
              }
            } else if (ctx.__typename === "StatusContext") {
              if (ctx.state === "SUCCESS") {
                passed++;
              } else if (ctx.state === "PENDING" || ctx.state === "EXPECTED") {
                pending++;
              } else {
                failed++;
              }
            }
          }

          return {
            branch,
            total: passed + failed + pending,
            passed,
            failed,
            pending,
          };
        });

        return { success: true, statuses };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(LIST_PULL_REQUESTS_CHANNEL);
  ipcMain.handle(
    LIST_PULL_REQUESTS_CHANNEL,
    async (_event, repoPath: string) => {
      try {
        const result = await runProcess(
          "gh",
          [
            "pr",
            "list",
            "--json",
            "number,title,headRefName,author,createdAt,updatedAt,isDraft,url,labels",
            "--state",
            "open",
            "--limit",
            "50",
          ],
          repoPath,
        );

        if (result.code !== 0) {
          return {
            success: false,
            error: result.stderr.trim() || "gh pr list failed",
          };
        }

        const pullRequests = JSON.parse(result.stdout.trim() || "[]");
        return { success: true, pullRequests };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(CHECKOUT_PULL_REQUEST_CHANNEL);
  ipcMain.handle(
    CHECKOUT_PULL_REQUEST_CHANNEL,
    async (
      _event,
      repoPath: string,
      branchName: string,
      workspaceId: string,
      setupCommands?: string[],
    ) => {
      try {
        const { worktreePath } = await ensureWorktreeForBranch(
          workspaceId,
          repoPath,
          branchName,
          setupCommands,
        );
        return { success: true, worktreePath };
      } catch (err) {
        console.error("Failed to checkout pull request:", err);
        return { success: false, error: String(err) };
      }
    },
  );
}
