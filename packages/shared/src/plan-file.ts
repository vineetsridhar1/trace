import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PLAN_FILE_MAX_BYTES = 512 * 1024;
export const PLAN_FILE_WATCH_INTERVAL_MS = 200;

export interface PlanFileSnapshot {
  content: string;
  contentHash: string;
  filePath: string;
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
  return `<system-instruction>
This is a Trace plan-mode run. Research the task without modifying implementation files. Write the complete working plan to ${filePath}. Create its parent directory if needed. The file is the source of truth and must be Markdown-compatible MDX with no imports, exports, scripts, styles, JavaScript expressions, or arbitrary HTML. Update the file whenever the plan changes and keep it standalone. Do not paste the plan into chat. Finish the turn after the plan file is complete.
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
  // Each planning turn must produce a fresh artifact. Otherwise an agent that
  // exits before writing could accidentally submit the previous turn's plan.
  fs.rmSync(filePath, { force: true });

  let stopped = false;
  let readAgain = false;
  let lastHash: string | null = null;
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
          const contentHash = createHash("sha256").update(content).digest("hex");
          if (contentHash === lastHash) continue;
          lastHash = contentHash;
          try {
            onSnapshot({ content, contentHash, filePath });
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
