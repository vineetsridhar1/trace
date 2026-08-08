import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getCodingToolCli } from "./coding-tools.js";
import { getModelsForTool, getReasoningEffortsForTool } from "./models.js";
import type { CodingToolCatalog, CodingToolCatalogEntry } from "./adapters/coding-tool.js";

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 10_000;

function hash(value: Omit<CodingToolCatalog, "hash">): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

function versionFrom(value: string): string | undefined {
  return value.match(/\d+(?:\.\d+)+(?:[-+][\w.-]+)?/)?.[0];
}

/**
 * Generic runtime-owned discovery. It deliberately returns only normalized
 * version text and static fallback selections: no CLI output or environment is
 * retained or sent across the bridge.
 */
export async function discoverRuntimeProviderCatalog(input: {
  tools: readonly string[];
  resolveExecutable: (command: string) => string | null;
  scope?: "global" | "workspace";
  workspacePath?: string;
}): Promise<CodingToolCatalog> {
  const fetchedAt = new Date().toISOString();
  const entries = await Promise.all(
    input.tools.map(async (tool): Promise<CodingToolCatalogEntry> => {
      if (tool === "custom") {
        return {
          tool,
          availability: "ready",
          source: "fallback",
          models: [],
          reasoningEfforts: [],
          features: [],
          discoveredAt: fetchedAt,
        };
      }
      const cli = getCodingToolCli(tool);
      const executable = cli && input.resolveExecutable(cli.command);
      if (!cli || !executable) {
        return {
          tool,
          availability: "unavailable",
          source: "fallback",
          models: [],
          reasoningEfforts: [],
          features: [],
          discoveredAt: fetchedAt,
          diagnostic: {
            code: "executable_missing",
            message: `${cli?.label ?? tool} is not installed on this runtime.`,
            remediation: cli ? `Install ${cli.label}: ${cli.install}` : undefined,
          },
        };
      }
      try {
        const { stdout, stderr } = await execFileAsync(executable, ["--version"], {
          timeout: PROBE_TIMEOUT_MS,
          windowsHide: true,
        });
        return {
          tool,
          availability: "ready",
          // Tool-specific adapters can replace this fallback with native probes.
          source: "fallback",
          version: versionFrom(`${stdout}\n${stderr}`),
          models: getModelsForTool(tool).map((model) => model.value),
          reasoningEfforts: getReasoningEffortsForTool(tool).map((effort) => effort.value),
          features: [],
          discoveredAt: fetchedAt,
        };
      } catch (error: unknown) {
        const timedOut = error instanceof Error && /timed?\s*out/i.test(error.message);
        return {
          tool,
          availability: "error",
          source: "fallback",
          models: [],
          reasoningEfforts: [],
          features: [],
          discoveredAt: fetchedAt,
          diagnostic: {
            code: timedOut ? "timeout" : "unknown",
            message: timedOut
              ? `${cli.label} did not respond while checking this runtime.`
              : `Trace could not inspect ${cli.label} on this runtime.`,
            remediation: timedOut ? "Try refreshing the runtime catalog." : undefined,
          },
        };
      }
    }),
  );
  const catalog = {
    scope: input.scope ?? "global",
    ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
    entries,
    fetchedAt,
  } satisfies Omit<CodingToolCatalog, "hash">;
  return { ...catalog, hash: hash(catalog) };
}
