import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const TRACE_GIT_HOOKS = ["prepare-commit-msg", "post-commit", "post-rewrite"] as const;

export type TraceGitHookName = (typeof TRACE_GIT_HOOKS)[number];
export type TraceGitHookState =
  | "not_installed"
  | "trace_managed"
  | "custom_present"
  | "chained"
  | "error";

const TRACE_MANAGED_MARKER = "# trace-managed-hook";
const TRACE_HOOK_NAME_MARKER = "# trace-hook-name=";
const TRACE_RUNNER_PATH_MARKER = "# trace-runner-path=";
const TRACE_CHAINED_HOOK_MARKER = "# trace-chained-hook=";

export interface TraceGitHookInspection {
  hookName: TraceGitHookName;
  hookPath: string;
  state: TraceGitHookState;
  isExecutable: boolean;
  runnerPath: string | null;
  chainedHookPath: string | null;
  error?: string | null;
}

export interface TraceGitHookStatus {
  hooksDir: string;
  state: TraceGitHookState;
  hooks: TraceGitHookInspection[];
}

type TraceGitHookMetadata = {
  hookName: string | null;
  runnerPath: string | null;
  chainedHookPath: string | null;
};

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function pathExists(targetPath: string | null | undefined): boolean {
  return !!targetPath && fs.existsSync(targetPath);
}

function parseTraceGitHookMetadata(content: string): TraceGitHookMetadata | null {
  if (!content.includes(TRACE_MANAGED_MARKER)) return null;

  const lines = content.split("\n");
  const readMarkerValue = (prefix: string) => {
    const line = lines.find((entry) => entry.startsWith(prefix));
    if (!line) return null;
    const value = line.slice(prefix.length).trim();
    return value.length > 0 ? value : null;
  };

  return {
    hookName: readMarkerValue(TRACE_HOOK_NAME_MARKER),
    runnerPath: readMarkerValue(TRACE_RUNNER_PATH_MARKER),
    chainedHookPath: readMarkerValue(TRACE_CHAINED_HOOK_MARKER),
  };
}

function summarizeHookStates(hooks: TraceGitHookInspection[]): TraceGitHookState {
  if (hooks.some((hook) => hook.state === "error")) return "error";
  if (hooks.some((hook) => hook.state === "custom_present")) return "custom_present";
  if (hooks.every((hook) => hook.state === "not_installed")) return "not_installed";

  const allManaged = hooks.every(
    (hook) => hook.state === "trace_managed" || hook.state === "chained",
  );
  if (allManaged && hooks.some((hook) => hook.state === "chained")) return "chained";
  if (allManaged) return "trace_managed";

  return "not_installed";
}

async function inspectTraceGitHook(
  hooksDir: string,
  hookName: TraceGitHookName,
): Promise<TraceGitHookInspection> {
  const hookPath = path.join(hooksDir, hookName);

  try {
    const stats = await fs.promises.stat(hookPath);
    if (!stats.isFile()) {
      return {
        hookName,
        hookPath,
        state: "error",
        isExecutable: false,
        runnerPath: null,
        chainedHookPath: null,
        error: "Hook path exists but is not a file.",
      };
    }

    const content = await fs.promises.readFile(hookPath, "utf8");
    const metadata = parseTraceGitHookMetadata(content);
    const isExecutable = (stats.mode & 0o111) !== 0;

    if (!metadata) {
      return {
        hookName,
        hookPath,
        state: "custom_present",
        isExecutable,
        runnerPath: null,
        chainedHookPath: null,
        error: null,
      };
    }

    if (metadata.hookName !== hookName) {
      return {
        hookName,
        hookPath,
        state: "error",
        isExecutable,
        runnerPath: metadata.runnerPath,
        chainedHookPath: metadata.chainedHookPath,
        error: `Hook metadata expected ${hookName}, found ${metadata.hookName ?? "unknown"}.`,
      };
    }

    if (!isExecutable) {
      return {
        hookName,
        hookPath,
        state: "error",
        isExecutable,
        runnerPath: metadata.runnerPath,
        chainedHookPath: metadata.chainedHookPath,
        error: "Hook is not executable.",
      };
    }

    if (!pathExists(metadata.runnerPath)) {
      return {
        hookName,
        hookPath,
        state: "error",
        isExecutable,
        runnerPath: metadata.runnerPath,
        chainedHookPath: metadata.chainedHookPath,
        error: "Trace hook runner is missing.",
      };
    }

    if (metadata.chainedHookPath && !pathExists(metadata.chainedHookPath)) {
      return {
        hookName,
        hookPath,
        state: "error",
        isExecutable,
        runnerPath: metadata.runnerPath,
        chainedHookPath: metadata.chainedHookPath,
        error: "Chained custom hook is missing.",
      };
    }

    return {
      hookName,
      hookPath,
      state: metadata.chainedHookPath ? "chained" : "trace_managed",
      isExecutable,
      runnerPath: metadata.runnerPath,
      chainedHookPath: metadata.chainedHookPath,
      error: null,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        hookName,
        hookPath,
        state: "not_installed",
        isExecutable: false,
        runnerPath: null,
        chainedHookPath: null,
        error: null,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      hookName,
      hookPath,
      state: "error",
      isExecutable: false,
      runnerPath: null,
      chainedHookPath: null,
      error: message,
    };
  }
}

function nextBackupHookPath(hookPath: string): string {
  let attempt = 0;
  while (true) {
    const suffix = attempt === 0 ? ".trace-user" : `.trace-user-${attempt + 1}`;
    const candidate = `${hookPath}${suffix}`;
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    attempt += 1;
  }
}

export function buildTraceGitHookScript({
  hookName,
  runnerPath,
  chainedHookPath,
}: {
  hookName: TraceGitHookName;
  runnerPath: string;
  chainedHookPath?: string | null;
}): string {
  const resolvedChainedHookPath = chainedHookPath ?? "";

  return [
    "#!/bin/sh",
    TRACE_MANAGED_MARKER,
    `${TRACE_HOOK_NAME_MARKER}${hookName}`,
    `${TRACE_RUNNER_PATH_MARKER}${runnerPath}`,
    `${TRACE_CHAINED_HOOK_MARKER}${resolvedChainedHookPath}`,
    "set -eu",
    "",
    `TRACE_HOOK_NAME=${shellQuote(hookName)}`,
    `TRACE_RUNNER_PATH=${shellQuote(runnerPath)}`,
    `TRACE_CHAINED_HOOK=${shellQuote(resolvedChainedHookPath)}`,
    "",
    'if [ -n "$TRACE_CHAINED_HOOK" ] && [ -x "$TRACE_CHAINED_HOOK" ]; then',
    '  "$TRACE_CHAINED_HOOK" "$@" || exit $?',
    "fi",
    "",
    'exec "$TRACE_RUNNER_PATH" "$TRACE_HOOK_NAME" "$@"',
    "",
  ].join("\n");
}

export async function resolveGitPath(repoPath: string, gitRelativePath: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--git-path", gitRelativePath], {
    cwd: repoPath,
  });
  const resolvedPath = stdout.trim();

  if (!resolvedPath) {
    throw new Error(`Unable to resolve git path for ${gitRelativePath}`);
  }

  return path.isAbsolute(resolvedPath) ? resolvedPath : path.resolve(repoPath, resolvedPath);
}

export function getTraceGitHooks(): readonly TraceGitHookName[] {
  return TRACE_GIT_HOOKS;
}

export async function resolveGitHooksDir(repoPath: string): Promise<string> {
  return resolveGitPath(repoPath, "hooks");
}

export async function inspectTraceGitHooks(repoPath: string): Promise<TraceGitHookStatus> {
  const hooksDir = await resolveGitHooksDir(repoPath);
  const hooks = await Promise.all(
    TRACE_GIT_HOOKS.map((hookName) => inspectTraceGitHook(hooksDir, hookName)),
  );

  return {
    hooksDir,
    state: summarizeHookStates(hooks),
    hooks,
  };
}

export async function installTraceGitHooks(
  repoPath: string,
  runnerPath: string,
): Promise<TraceGitHookStatus> {
  const hooksDir = await resolveGitHooksDir(repoPath);
  await fs.promises.mkdir(hooksDir, { recursive: true });

  for (const hookName of TRACE_GIT_HOOKS) {
    const hookPath = path.join(hooksDir, hookName);
    let chainedHookPath: string | null = null;

    try {
      const content = await fs.promises.readFile(hookPath, "utf8");
      const metadata = parseTraceGitHookMetadata(content);

      if (metadata?.chainedHookPath && pathExists(metadata.chainedHookPath)) {
        chainedHookPath = metadata.chainedHookPath;
      } else if (!metadata) {
        chainedHookPath = nextBackupHookPath(hookPath);
        await fs.promises.rename(hookPath, chainedHookPath);
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    await fs.promises.writeFile(
      hookPath,
      buildTraceGitHookScript({
        hookName,
        runnerPath,
        chainedHookPath,
      }),
      "utf8",
    );
    await fs.promises.chmod(hookPath, 0o755);
  }

  return inspectTraceGitHooks(repoPath);
}

export async function uninstallTraceGitHooks(repoPath: string): Promise<TraceGitHookStatus> {
  const hooksDir = await resolveGitHooksDir(repoPath);

  for (const hookName of TRACE_GIT_HOOKS) {
    const hookPath = path.join(hooksDir, hookName);

    let content: string;
    try {
      content = await fs.promises.readFile(hookPath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) continue;
      throw error;
    }

    const metadata = parseTraceGitHookMetadata(content);
    if (!metadata) continue;

    await fs.promises.rm(hookPath, { force: true });

    if (metadata.chainedHookPath && pathExists(metadata.chainedHookPath)) {
      await fs.promises.rename(metadata.chainedHookPath, hookPath);
      await fs.promises.chmod(hookPath, 0o755);
    }
  }

  return inspectTraceGitHooks(repoPath);
}
