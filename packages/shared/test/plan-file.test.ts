import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPlanFileInstruction,
  createPlanFileWatcher,
  getPlanFilePath,
} from "../src/plan-file.js";

const sessionIds: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    sessionIds
      .splice(0)
      .map((sessionId) => fs.promises.rm(getPlanFilePath(sessionId), { force: true })),
  );
});

describe("plan file", () => {
  it("builds a session-specific path and instruction", () => {
    const filePath = getPlanFilePath("session-123");
    expect(filePath).toContain("trace-plans/session-123/plan.mdx");
    expect(buildPlanFileInstruction(filePath)).toContain(filePath);
    expect(buildPlanFileInstruction(filePath)).toContain("Do not paste the plan into chat");
  });

  it("publishes changed non-empty snapshots once per content hash", async () => {
    const sessionId = `plan-file-${Date.now()}`;
    sessionIds.push(sessionId);
    const snapshots: string[] = [];
    const watcher = createPlanFileWatcher({
      sessionId,
      onSnapshot: (snapshot) => snapshots.push(snapshot.content),
    });

    await fs.promises.writeFile(watcher.filePath, "# First\n", "utf8");
    await watcher.flush();
    await watcher.flush();
    await fs.promises.writeFile(watcher.filePath, "# Second\n", "utf8");
    await watcher.flush();
    watcher.stop();

    expect(snapshots).toEqual(["# First\n", "# Second\n"]);
  });

  it("clears a previous turn's artifact before watching", async () => {
    const sessionId = `plan-file-stale-${Date.now()}`;
    sessionIds.push(sessionId);
    const filePath = getPlanFilePath(sessionId);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, "# Stale plan\n", "utf8");
    const snapshots: string[] = [];

    const watcher = createPlanFileWatcher({
      sessionId,
      onSnapshot: (snapshot) => snapshots.push(snapshot.content),
    });
    await watcher.flush();
    watcher.stop();

    expect(fs.existsSync(filePath)).toBe(false);
    expect(snapshots).toEqual([]);
  });
});
