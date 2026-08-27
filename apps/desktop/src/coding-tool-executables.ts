import { accessSync, constants, statSync } from "node:fs";
import { CODING_TOOL_CLIS } from "@trace/shared";
import { resolveExecutable } from "@trace/shared/adapters";
import { getCodingToolExecutableOverrides } from "./config.js";
import { hydrateLoginShellPath, type LoginShellPathResult } from "./shell-path.js";

export type CodingToolExecutableSource = "automatic" | "override";

export type CodingToolExecutableResolution = {
  executablePath: string | null;
  executableSource: CodingToolExecutableSource | null;
  executableOverride: string | null;
};

export type CodingToolExecutableRegistryDependencies = {
  hydratePath: () => Promise<LoginShellPathResult>;
  readOverrides: () => Record<string, string>;
  resolveCommand: (command: string) => string | null;
  isExecutable: (executablePath: string) => boolean;
  warn: (message: string) => void;
};

export function isExecutableFile(executablePath: string): boolean {
  try {
    accessSync(executablePath, constants.X_OK);
    return statSync(executablePath).isFile();
  } catch {
    return false;
  }
}

const defaultDependencies: CodingToolExecutableRegistryDependencies = {
  hydratePath: () => hydrateLoginShellPath(),
  readOverrides: () => getCodingToolExecutableOverrides(),
  resolveCommand: (command) => resolveExecutable(command),
  isExecutable: (executablePath) => isExecutableFile(executablePath),
  warn: (message) => console.warn(message),
};

export class CodingToolExecutableRegistry {
  private resolutions = new Map<string, CodingToolExecutableResolution>();
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly dependencies: CodingToolExecutableRegistryDependencies = defaultDependencies,
  ) {}

  refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.refreshNow().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async refreshAfterCurrent(): Promise<void> {
    const currentRefresh = this.refreshPromise;
    if (currentRefresh) await currentRefresh;
    await this.refresh();
  }

  private async refreshNow(): Promise<void> {
    const shellResult = await this.dependencies.hydratePath();
    if (shellResult.error) {
      this.dependencies.warn(
        `[coding-tools] failed to load login-shell PATH: ${shellResult.error}`,
      );
    }

    const overrides = this.dependencies.readOverrides();
    const next = new Map<string, CodingToolExecutableResolution>();
    for (const tool of Object.values(CODING_TOOL_CLIS)) {
      const executableOverride = overrides[tool.tool] ?? null;
      if (executableOverride) {
        const executable = this.dependencies.isExecutable(executableOverride);
        next.set(tool.tool, {
          executablePath: executable ? executableOverride : null,
          executableSource: executable ? "override" : null,
          executableOverride,
        });
        continue;
      }

      const executablePath = this.dependencies.resolveCommand(tool.command);
      next.set(tool.tool, {
        executablePath,
        executableSource: executablePath ? "automatic" : null,
        executableOverride: null,
      });
    }
    this.resolutions = next;
  }

  get(toolId: string): CodingToolExecutableResolution {
    return (
      this.resolutions.get(toolId) ?? {
        executablePath: null,
        executableSource: null,
        executableOverride: null,
      }
    );
  }
}

export const codingToolExecutableRegistry = new CodingToolExecutableRegistry();
