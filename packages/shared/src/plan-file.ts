import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getTraceVisualPlanSkillPath,
  materializeTraceVisualPlanSkill,
  validateTraceVisualPlan,
} from "./visual-plan-skill.js";

export const PLAN_FILE_MAX_BYTES = 512 * 1024;
export const PLAN_FILE_WATCH_INTERVAL_MS = 200;

export interface PlanFileSnapshot {
  content: string;
  contentHash: string;
  filePath: string;
  validationErrors: string[];
}

export interface PlanFileWatcher {
  filePath: string;
  flush: () => Promise<void>;
  stop: () => void;
}

export function getPlanFilePath(sessionId: string): string {
  return path.join(os.tmpdir(), "trace-plans", sessionId, "plan.mdx");
}

export function buildPlanFileInstruction(filePath: string): string {
  const skillPath = getTraceVisualPlanSkillPath(filePath);
  return `<system-instruction>
This is a Trace plan-mode run. You MUST read and follow the complete visual-plan
skill at ${skillPath} before drafting. That file and its references are the exact
Builder.io visual-plan skill bundle and override every provider-native plan
format for Claude, Codex, Agy, Pi, and all other coding agents.

Trace replaces only the skill's publishing transport. Treat this as local-files
mode, but do not call hosted Plan MCP tools and do not run the plan local CLI.
Instead, write the complete Agent-Native plan.mdx directly to ${filePath}.
Trace watches and renders that file. Create its parent directory if needed,
update the same file whenever feedback changes the plan, and use the skill's
native MDX block vocabulary—not ordinary Markdown and not Trace-specific custom
tags. Do not emit a provider-native plan block or call a provider-native exit
plan mode tool. If plan.mdx already exists, it is the prior review draft: read
and edit it in place. Trace requires a changed file content hash for every
revision run, so do not finish by merely reporting that the existing file is
complete. Do not paste the plan into chat. Finish after the file contains the
complete standalone plan.
</system-instruction>`;
}

export function createPlanFileWatcher({
  sessionId,
  onSnapshot,
  onError,
}: {
  sessionId: string;
  onSnapshot: (snapshot: PlanFileSnapshot) => void;
  onError?: (message: string) => void;
}): PlanFileWatcher {
  const filePath = getPlanFilePath(sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  materializeTraceVisualPlanSkill(filePath);

  let stopped = false;
  let readAgain = false;
  // Preserve the previous draft so revision/repair runs can edit it. Seed the
  // hash without publishing: only a changed write from this run is fresh.
  let lastHash: string | null = null;
  try {
    const existing = fs.readFileSync(filePath, "utf8");
    if (
      existing.trim() &&
      Buffer.byteLength(existing, "utf8") <= PLAN_FILE_MAX_BYTES
    ) {
      lastHash = createHash("sha256").update(existing).digest("hex");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      onError?.(error instanceof Error ? error.message : "Failed to inspect prior plan file");
    }
  }
  let activeRead: Promise<void> | null = null;

  const readCurrent = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    readAgain = true;
    if (!activeRead) {
      activeRead = (async () => {
        while (readAgain && !stopped) {
          readAgain = false;
          let stat: fs.Stats;
          try {
            stat = await fs.promises.stat(filePath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
              onError?.(error instanceof Error ? error.message : "Failed to inspect plan file");
            }
            continue;
          }
          if (!stat.isFile()) {
            onError?.("Plan path is not a file");
            continue;
          }
          if (stat.size > PLAN_FILE_MAX_BYTES) {
            onError?.(`Plan file exceeds ${PLAN_FILE_MAX_BYTES} bytes`);
            continue;
          }
          let content: string;
          try {
            content = await fs.promises.readFile(filePath, "utf8");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
              onError?.(error instanceof Error ? error.message : "Failed to read plan file");
            }
            continue;
          }
          if (!content.trim()) continue;
          if (Buffer.byteLength(content, "utf8") > PLAN_FILE_MAX_BYTES) {
            onError?.(`Plan file exceeds ${PLAN_FILE_MAX_BYTES} bytes`);
            continue;
          }
          const validationErrors = validateTraceVisualPlan(content);
          const contentHash = createHash("sha256").update(content).digest("hex");
          if (contentHash === lastHash) continue;
          lastHash = contentHash;
          try {
            onSnapshot({ content, contentHash, filePath, validationErrors });
          } catch (error) {
            onError?.(error instanceof Error ? error.message : "Failed to publish plan file");
          }
        }
      })().finally(() => {
        activeRead = null;
      });
    }
    return activeRead;
  };

  const listener = () => {
    void readCurrent();
  };
  fs.watchFile(filePath, { interval: PLAN_FILE_WATCH_INTERVAL_MS }, listener);
  void readCurrent();

  return {
    filePath,
    flush: readCurrent,
    stop: () => {
      if (stopped) return;
      stopped = true;
      fs.unwatchFile(filePath, listener);
    },
  };
}
