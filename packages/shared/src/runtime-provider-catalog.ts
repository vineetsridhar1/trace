import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { getCodingToolCli } from "./coding-tools.js";
import { getModelsForTool, getReasoningEffortsForTool } from "./models.js";
import type { CodingToolCatalog, CodingToolCatalogEntry } from "./adapters/coding-tool.js";

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 10_000;

type CodexModel = { id: string; supportedReasoningEfforts?: Array<{ reasoningEffort?: string }> };

async function discoverCodexModels(executable: string): Promise<{
  models: string[];
  reasoningEfforts: string[];
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out"));
    }, PROBE_TIMEOUT_MS);
    const finish = (value: { models: string[]; reasoningEfforts: string[] }) => {
      clearTimeout(timer);
      child.kill();
      resolve(value);
    };
    child.once("error", reject);
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        try {
          const message: unknown = JSON.parse(line);
          if (!message || typeof message !== "object" || Array.isArray(message)) continue;
          const record = message as Record<string, unknown>;
          if (record.id === 1) {
            child.stdin.write(JSON.stringify({ id: 2, method: "model/list", params: {} }) + "\n");
          }
          if (record.id === 2 && record.result && typeof record.result === "object") {
            const data = (record.result as Record<string, unknown>).data;
            if (!Array.isArray(data)) throw new Error("Malformed response");
            const models = data.filter((item): item is CodexModel =>
              !!item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string",
            );
            finish({
              models: models.map((model) => model.id),
              reasoningEfforts: [...new Set(models.flatMap((model) =>
                (model.supportedReasoningEfforts ?? []).flatMap((effort) =>
                  typeof effort.reasoningEffort === "string" ? [effort.reasoningEffort] : [],
                ),
              ))],
            });
          }
        } catch (error) {
          clearTimeout(timer);
          child.kill();
          reject(error);
        }
      }
    });
    child.stdin.write(JSON.stringify({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "trace", title: "Trace", version: "0" }, capabilities: { experimentalApi: true } },
    }) + "\n");
  });
}

async function discoverPiModels(executable: string): Promise<string[]> {
  const { stdout } = await execFileAsync(executable, ["--list-models"], { timeout: PROBE_TIMEOUT_MS, windowsHide: true });
  const models = stdout.split("\n").flatMap((line) => {
    const columns = line.trim().split(/\s{2,}/);
    return columns.length >= 2 && columns[0] !== "provider" ? [`${columns[0]}/${columns[1]}`] : [];
  });
  if (models.length === 0) throw new Error("Malformed response");
  return models;
}

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
        const native = tool === "codex"
          ? await discoverCodexModels(executable)
          : tool === "pi"
            ? {
                models: await discoverPiModels(executable),
                reasoningEfforts: ["off", "minimal", "low", "medium", "high", "xhigh"],
              }
            : null;
        return {
          tool,
          availability: "ready",
          source: native ? "discovered" : "fallback",
          version: versionFrom(`${stdout}\n${stderr}`),
          models: native?.models ?? getModelsForTool(tool).map((model) => model.value),
          reasoningEfforts: native?.reasoningEfforts ?? getReasoningEffortsForTool(tool).map((effort) => effort.value),
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
