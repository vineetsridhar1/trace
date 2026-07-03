import path from "path";
import type { TraceGitHookStatus } from "@trace/shared/git-hooks";
import {
  inspectTraceGitHooks,
  installTraceGitHooks,
  uninstallTraceGitHooks,
} from "@trace/shared/git-hooks";
import { formatGitError } from "./git-utils.js";
import { ensureHookRunnerEntrypoint } from "./hook-runtime.js";

function getRunnerScriptPath(): string {
  return path.join(__dirname, "hook-runner.js");
}

export async function getRepoHookStatus(repoPath: string): Promise<TraceGitHookStatus> {
  return inspectTraceGitHooks(repoPath);
}

export async function installOrRepairRepoHooks(repoPath: string): Promise<TraceGitHookStatus> {
  const runnerPath = ensureHookRunnerEntrypoint({
    electronBinaryPath: process.execPath,
    runnerScriptPath: getRunnerScriptPath(),
  });
  return installTraceGitHooks(repoPath, runnerPath);
}

export async function installOrRepairRepoHooksBestEffort(
  repoPath: string,
  context: string,
): Promise<void> {
  try {
    await installOrRepairRepoHooks(repoPath);
  } catch (error) {
    console.warn(
      `[repo-hooks] failed to install Trace hooks during ${context} for ${repoPath}: ${formatGitError(error)}`,
    );
  }
}

export async function disableRepoHooks(repoPath: string): Promise<TraceGitHookStatus> {
  return uninstallTraceGitHooks(repoPath);
}
