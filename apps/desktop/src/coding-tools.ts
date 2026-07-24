import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { CODING_TOOL_CLIS, type CodingToolCli } from "@trace/shared";
import { resolveExecutable } from "@trace/shared/adapters";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 10_000;

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

async function getInstalledVersion(command: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, ["--version"], {
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
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
      if (!resolveExecutable(tool.command)) {
        return {
          tool: tool.tool,
          label: tool.label,
          status: "missing",
          installedVersion: null,
          latestVersion: null,
        };
      }

      const installedVersion = await getInstalledVersion(tool.command);
      const npmTool = NPM_TOOLS[tool.tool];
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

  await new Promise<void>((resolve, reject) => {
    const child = spawn("/bin/sh", ["-lc", tool.install], {
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${tool.label} install failed${code === null ? "" : ` (exit ${code})`}.`));
    });
  });

  const statuses = await getCodingToolStatuses();
  return statuses.find((status) => status.tool === toolId) ?? {
    tool: tool.tool,
    label: tool.label,
    status: "unknown",
    installedVersion: null,
    latestVersion: null,
  };
}
