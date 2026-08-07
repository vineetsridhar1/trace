import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { CODING_TOOL_CLIS, type CodingToolCli } from "@trace/shared";
import { buildChildProcessEnv, resolveExecutable } from "@trace/shared/adapters";

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
};

type NpmTool = CodingToolCli & { packageName: string };

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

export async function getCodingToolStatuses(): Promise<DesktopCodingToolStatus[]> {
  return Promise.all(
    Object.values(CODING_TOOL_CLIS).map(async (tool) => {
      const npmTool = NPM_TOOLS[tool.tool];
      const executablePath = resolveExecutable(tool.command);
      if (!executablePath) {
        const latestVersion = npmTool ? await getLatestNpmVersion(npmTool.packageName) : null;
        return {
          tool: tool.tool,
          label: tool.label,
          status: "missing",
          installedVersion: null,
          latestVersion,
        };
      }

      const installedVersion = await getInstalledVersion(executablePath);
      const latestVersion = npmTool ? await getLatestNpmVersion(npmTool.packageName) : null;
      const comparison =
        installedVersion && latestVersion ? compareVersions(installedVersion, latestVersion) : null;
      return {
        tool: tool.tool,
        label: tool.label,
        status: comparison !== null && comparison < 0 ? "update_available" : "installed",
        installedVersion,
        latestVersion,
      };
    }),
  );
}

export async function installOrUpdateCodingTool(toolId: string): Promise<DesktopCodingToolStatus> {
  const tool = CODING_TOOL_CLIS[toolId];
  if (!tool) throw new Error("Unsupported coding tool.");
  const npmTool = NPM_TOOLS[toolId];
  const command = npmTool
    ? { executable: "npm", args: ["install", "--global", `${npmTool.packageName}@latest`] }
    : { executable: "/bin/sh", args: ["-lc", tool.install] };

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
  const status =
    statuses.find((candidate) => candidate.tool === toolId) ?? {
      tool: tool.tool,
      label: tool.label,
      status: "unknown",
      installedVersion: null,
      latestVersion: null,
    };
  if (npmTool && (!status.installedVersion || !status.latestVersion)) {
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
