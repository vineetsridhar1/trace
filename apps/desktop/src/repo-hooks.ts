import path from "path";
import type { TraceGitHookStatus } from "@trace/shared/git-hooks";
import {
  inspectTraceGitHooks,
  installTraceGitHooks,
  uninstallTraceGitHooks,
} from "@trace/shared/git-hooks";
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

export async function disableRepoHooks(repoPath: string): Promise<TraceGitHookStatus> {
  return uninstallTraceGitHooks(repoPath);
}
