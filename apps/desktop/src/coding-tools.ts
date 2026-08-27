import { execFile, spawn } from "node:child_process";
import { basename, dirname, parse } from "node:path";
import { realpathSync } from "node:fs";
import { promisify } from "node:util";
import { CODING_TOOL_CLIS, type CodingToolCli } from "@trace/shared";
import { buildChildProcessEnv } from "@trace/shared/adapters";
import {
  codingToolExecutableRegistry,
  type CodingToolExecutableSource,
} from "./coding-tool-executables.js";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 10_000;
const INSTALL_TIMEOUT_MS = 120_000;

type ToolStatus = "installed" | "missing" | "update_available" | "unknown";

export type DesktopCodingToolStatus = {
  tool: string;
  label: string;
  status: ToolStatus;
  installedVersion: string | null;
  latestVersion: string | null;
  executablePath: string | null;
  executableSource: CodingToolExecutableSource | null;
  executableOverride: string | null;
};

type NpmTool = CodingToolCli & { packageName: string };

export type PackageManager =
  | { kind: "homebrew"; packageName: string; cask: boolean }
  | { kind: "npm"; packageName: string };

const NPM_TOOLS: Readonly<Record<string, NpmTool>> = {
  claude_code: { ...CODING_TOOL_CLIS.claude_code, packageName: "@anthropic-ai/claude-code" },
  codex: { ...CODING_TOOL_CLIS.codex, packageName: "@openai/codex" },
};

function normalizeVersion(output: string): string | null {
  const match = output.match(/\d+(?:\.\d+)+(?:[-+][\w.-]+)?/);
  return match?.[0] ?? null;
}

async function getInstalledVersion(executablePath: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(executablePath, ["--version"], {
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
      env: buildChildProcessEnv(),
    });
    return normalizeVersion(`${stdout}\n${stderr}`);
  } catch {
    return null;
  }
}

export async function validateCodingToolExecutable(
  toolId: string,
  executablePath: string,
  readVersion: (path: string) => Promise<string | null> = getInstalledVersion,
): Promise<string> {
  const tool = CODING_TOOL_CLIS[toolId];
  if (!tool) throw new Error("Unsupported coding tool.");

  const selectedCommand = basename(executablePath);
  if (selectedCommand !== tool.command) {
    throw new Error(`Select the ${tool.command} executable for ${tool.label}.`);
  }

  const version = await readVersion(executablePath);
  if (!version) {
    throw new Error(`${tool.label} did not respond successfully to --version.`);
  }
  return version;
}

async function getLatestNpmVersion(packageName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("npm", ["view", packageName, "version", "--json"], {
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
      env: buildChildProcessEnv(),
    });
    const value: unknown = JSON.parse(stdout);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

async function getLatestHomebrewVersion({
  packageName,
  cask,
}: Extract<PackageManager, { kind: "homebrew" }>): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "brew",
      ["info", "--json=v2", ...(cask ? ["--cask"] : []), packageName],
      {
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
        env: buildChildProcessEnv(),
      },
    );
    const value: unknown = JSON.parse(stdout);
    if (!value || typeof value !== "object") return null;
    const packages = (value as Record<string, unknown>)[cask ? "casks" : "formulae"];
    if (!Array.isArray(packages) || packages.length !== 1) return null;
    const version = (packages[0] as Record<string, unknown>).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

function compareVersions(left: string, right: string): number | null {
  const parse = (version: string) => version.split("-")[0]!.split(".").map(Number);
  const leftParts = parse(left);
  const rightParts = parse(right);
  if ([...leftParts, ...rightParts].some((part) => !Number.isFinite(part))) return null;
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Finds the global npm prefix that owns an executable, if it is installed in
 * the conventional <prefix>/lib/node_modules tree. A desktop app can inherit
 * a different npm than the one that installed the CLI (for example, a second
 * nvm Node version), so relying on npm's default prefix can update the wrong
 * copy while leaving the detected executable unchanged.
 */
function getOwningNpmPrefix(executablePath: string | null): string | null {
  if (!executablePath) return null;

  let current: string;
  try {
    current = realpathSync(executablePath);
  } catch {
    return null;
  }

  const root = parse(current).root;
  while (current !== root) {
    if (basename(current) === "node_modules") {
      const libDirectory = dirname(current);
      return basename(libDirectory) === "lib" ? dirname(libDirectory) : null;
    }
    current = dirname(current);
  }
  return null;
}

export function getPackageManager(
  toolId: string,
  executablePath: string | null,
  resolvePath: (path: string) => string = realpathSync,
): PackageManager | null {
  if (toolId === "codex" && executablePath) {
    try {
      const resolvedPath = resolvePath(executablePath);
      if (/(?:^|[\\/])Caskroom[\\/]codex[\\/]/.test(resolvedPath)) {
        return { kind: "homebrew", packageName: "codex", cask: true };
      }
      if (/(?:^|[\\/])Cellar[\\/]codex[\\/]/.test(resolvedPath)) {
        return { kind: "homebrew", packageName: "codex", cask: false };
      }
    } catch {
      // Fall back to npm metadata when the executable cannot be resolved.
    }
  }

  const npmTool = NPM_TOOLS[toolId];
  return npmTool ? { kind: "npm", packageName: npmTool.packageName } : null;
}

async function getLatestVersion(packageManager: PackageManager | null): Promise<string | null> {
  if (!packageManager) return null;
  return packageManager.kind === "homebrew"
    ? getLatestHomebrewVersion(packageManager)
    : getLatestNpmVersion(packageManager.packageName);
}

export function getInstallCommand(
  tool: CodingToolCli,
  packageManager: PackageManager | null,
  npmPrefix: string | null,
): { executable: string; args: string[] } {
  if (packageManager?.kind === "homebrew") {
    return {
      executable: "brew",
      args: ["upgrade", ...(packageManager.cask ? ["--cask"] : []), packageManager.packageName],
    };
  }
  if (packageManager?.kind === "npm") {
    return {
      executable: "npm",
      args: [
        ...(npmPrefix ? ["--prefix", npmPrefix] : []),
        "install",
        "--global",
        `${packageManager.packageName}@latest`,
      ],
    };
  }
  return { executable: "/bin/sh", args: ["-lc", tool.install] };
}

export async function getCodingToolStatuses({
  refreshExecutables = true,
}: { refreshExecutables?: boolean } = {}): Promise<DesktopCodingToolStatus[]> {
  if (refreshExecutables) await codingToolExecutableRegistry.refresh();
  return Promise.all(
    Object.values(CODING_TOOL_CLIS).map(async (tool) => {
      const resolution = codingToolExecutableRegistry.get(tool.tool);
      const executablePath = resolution.executablePath;
      const packageManager = getPackageManager(tool.tool, executablePath);
      if (!executablePath) {
        const latestVersion = await getLatestVersion(packageManager);
        return {
          tool: tool.tool,
          label: tool.label,
          status: "missing",
          installedVersion: null,
          latestVersion,
          ...resolution,
        };
      }

      const installedVersion = await getInstalledVersion(executablePath);
      const latestVersion = await getLatestVersion(packageManager);
      const comparison =
        installedVersion && latestVersion ? compareVersions(installedVersion, latestVersion) : null;
      return {
        tool: tool.tool,
        label: tool.label,
        status: comparison !== null && comparison < 0 ? "update_available" : "installed",
        installedVersion,
        latestVersion,
        ...resolution,
      };
    }),
  );
}

export async function installOrUpdateCodingTool(toolId: string): Promise<DesktopCodingToolStatus> {
  await codingToolExecutableRegistry.refresh();
  const tool = CODING_TOOL_CLIS[toolId];
  if (!tool) throw new Error("Unsupported coding tool.");
  const executablePath = codingToolExecutableRegistry.get(toolId).executablePath;
  const packageManager = getPackageManager(toolId, executablePath);
  const command = getInstallCommand(
    tool,
    packageManager,
    packageManager?.kind === "npm" ? getOwningNpmPrefix(executablePath) : null,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      env: buildChildProcessEnv(),
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
    }, INSTALL_TIMEOUT_MS);
    timeout.unref();
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim().split("\n").at(-1);
      reject(
        new Error(
          `${tool.label} install failed${code === null ? " (timed out)" : ` (exit ${code})`}${
            detail ? `: ${detail}` : "."
          }`,
        ),
      );
    });
  });

  const statuses = await getCodingToolStatuses();
  const status = statuses.find((candidate) => candidate.tool === toolId) ?? {
    tool: tool.tool,
    label: tool.label,
    status: "unknown",
    installedVersion: null,
    latestVersion: null,
    executablePath: null,
    executableSource: null,
    executableOverride: null,
  };
  if (packageManager?.kind === "npm" && (!status.installedVersion || !status.latestVersion)) {
    throw new Error(
      `${tool.label} was installed, but Trace could not verify its version. Check your connection, then try again.`,
    );
  }
  if (status.status === "update_available") {
    throw new Error(
      `${tool.label} is still running ${status.installedVersion ?? "an older version"}. ` +
        `It may be managed by a different installation. Update it with \`${tool.install}\` in Terminal, then check again.`,
    );
  }
  return status;
}
