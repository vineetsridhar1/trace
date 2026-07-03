import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Command } from "commander";
import {
  BridgeClient,
  getBridgeLabel,
  getOrCreateInstanceId,
  readConfig as readRuntimeRegistry,
  removeRepoPath,
  saveRepoPath,
  setBridgeHostPaths,
  setBridgeLabel,
} from "@trace/bridge-host";
import { configDir, getToken, resolveServerUrl } from "../config.js";
import { exitUnauthenticated, graphqlRequest } from "../http.js";
import { findByName, requireActiveOrg } from "../resolve.js";

const execFileAsync = promisify(execFile);

/** The CLI's runtime registry lives beside the CLI config (XDG-aware),
 *  separate from the desktop app's ~/.trace/config.json. */
function configureBridgePaths(): void {
  setBridgeHostPaths({
    configPath: path.join(configDir(), "runtime.json"),
    stateDir: path.join(configDir(), "bridge-state"),
  });
}

interface ServerRepo {
  id: string;
  name: string;
  remoteUrl: string | null;
}

async function fetchServerRepos(serverUrl: string, orgId: string): Promise<ServerRepo[]> {
  const data = await graphqlRequest<{ repos: ServerRepo[] }>(
    serverUrl,
    "query($orgId: ID!) { repos(organizationId: $orgId) { id name remoteUrl } }",
    { orgId },
  );
  return data.repos;
}

/** Normalize git remotes so https://github.com/o/r.git and git@github.com:o/r match. */
export function normalizeRemoteUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/^[a-z+]+:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

async function detectRemoteUrl(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: dir });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveRepoForPath(
  serverUrl: string,
  orgId: string,
  localPath: string,
  explicitName: string | undefined,
): Promise<ServerRepo> {
  const repos = await fetchServerRepos(serverUrl, orgId);
  if (explicitName) {
    return findByName(repos, explicitName, "repo");
  }
  const remote = await detectRemoteUrl(localPath);
  if (remote) {
    const normalized = normalizeRemoteUrl(remote);
    const matched = repos.filter(
      (repo) => repo.remoteUrl && normalizeRemoteUrl(repo.remoteUrl) === normalized,
    );
    if (matched.length === 1) return matched[0] as ServerRepo;
  }
  throw new Error(
    `Could not match ${localPath} to a Trace repo by remote URL. ` +
      `Pass --repo <name>; known repos: ${repos.map((repo) => repo.name).join(", ") || "none"}.`,
  );
}

export function registerRuntimeCommands(program: Command): void {
  const runtime = program
    .command("runtime")
    .description("Host Trace sessions on this machine (local runtime)");

  runtime
    .command("add-repo")
    .description("Register a local checkout so sessions can run against it")
    .argument("<path>", "path to a local git checkout")
    .option("--repo <name>", "Trace repo name (skips remote-URL matching)")
    .action(async (rawPath: string, opts: { repo?: string }, cmd: Command) => {
      const serverUrl = resolveServerUrl(cmd.optsWithGlobals().server as string | undefined);
      const orgId = requireActiveOrg();
      const localPath = path.resolve(rawPath);
      if (!existsSync(path.join(localPath, ".git"))) {
        throw new Error(`${localPath} is not a git checkout`);
      }
      const repo = await resolveRepoForPath(serverUrl, orgId, localPath, opts.repo);
      configureBridgePaths();
      await saveRepoPath(repo.id, localPath);
      console.log(`Registered ${repo.name} (${repo.id}) → ${localPath}`);
    });

  runtime
    .command("list-repos")
    .description("Show registered local checkouts")
    .action(async (_opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      configureBridgePaths();
      const registry = readRuntimeRegistry();
      const entries = Object.entries(registry.repos);
      let names = new Map<string, string>();
      try {
        const serverUrl = resolveServerUrl(globals.server as string | undefined);
        const repos = await fetchServerRepos(serverUrl, requireActiveOrg());
        names = new Map(repos.map((repo) => [repo.id, repo.name]));
      } catch {
        // Names are decoration; the registry itself is local.
      }
      if (globals.json) {
        console.log(
          JSON.stringify(
            entries.map(([repoId, entry]) => ({
              repoId,
              name: names.get(repoId) ?? null,
              path: entry.path,
            })),
          ),
        );
        return;
      }
      if (entries.length === 0) {
        console.error("No repos registered. Run `trace runtime add-repo <path>`.");
        return;
      }
      for (const [repoId, entry] of entries) {
        console.log(`${names.get(repoId) ?? repoId}  ${entry.path}`);
      }
    });

  runtime
    .command("remove-repo")
    .description("Unregister a local checkout (never deletes files)")
    .argument("<path-or-name>", "registered path, repo name, or repo ID")
    .action(async (target: string, _opts: unknown, cmd: Command) => {
      configureBridgePaths();
      const registry = readRuntimeRegistry();
      const resolvedPath = path.resolve(target);
      let repoId = Object.entries(registry.repos).find(
        ([id, entry]) => entry.path === resolvedPath || id === target,
      )?.[0];
      if (!repoId) {
        try {
          const serverUrl = resolveServerUrl(cmd.optsWithGlobals().server as string | undefined);
          const repos = await fetchServerRepos(serverUrl, requireActiveOrg());
          const byName = repos.find(
            (repo) => repo.name.toLowerCase() === target.toLowerCase() && registry.repos[repo.id],
          );
          repoId = byName?.id;
        } catch {
          // fall through to the error below
        }
      }
      if (!repoId || !(await removeRepoPath(repoId))) {
        throw new Error(
          `No registered repo matches "${target}". Run \`trace runtime list-repos\`.`,
        );
      }
      console.log(`Unregistered ${repoId}`);
    });

  runtime
    .command("up")
    .description("Connect this machine as a local Trace runtime (Ctrl-C to stop)")
    .option("--label <label>", "runtime label shown in Trace (persisted)")
    .action(async (opts: { label?: string }, cmd: Command) => {
      const serverUrl = resolveServerUrl(cmd.optsWithGlobals().server as string | undefined);
      const orgId = requireActiveOrg();
      if (!getToken()) {
        exitUnauthenticated();
      }
      configureBridgePaths();
      if (opts.label) {
        await setBridgeLabel(opts.label);
      } else if (!getBridgeLabel()) {
        await setBridgeLabel(`trace-cli @ ${os.hostname()}`);
      }

      const registry = readRuntimeRegistry();
      const repoCount = Object.keys(registry.repos).length;
      if (repoCount === 0) {
        console.error("# no repos registered — sessions needing a repo checkout cannot prepare");
        console.error("# register one with: trace runtime add-repo <path>");
      }

      const client = new BridgeClient(serverUrl, async () => {
        const token = getToken();
        if (!token) {
          throw new Error("Not authenticated. Run `trace login`.");
        }
        // The server accepts the bearer JWT as the trace_token cookie.
        return `trace_token=${token}`;
      });
      client.onStatusChange((status) => {
        console.error(`# ${status}`);
      });

      console.log(
        `Runtime ${getOrCreateInstanceId()} "${getBridgeLabel()}" — ${repoCount} repo(s) registered`,
      );
      for (const [repoId, entry] of Object.entries(registry.repos)) {
        console.log(`  ${repoId} → ${entry.path}`);
      }

      client.setAuthContext(orgId);

      await new Promise<void>((resolve) => {
        process.once("SIGINT", () => resolve());
      });
      const active = client.getActiveSessionIds();
      if (active.length > 0) {
        console.error(
          `# stopping with ${active.length} active session(s): ${active.join(", ")} — their tool processes will be terminated; worktrees are kept`,
        );
      }
      client.disconnect();
      process.exit(0);
    });
}
