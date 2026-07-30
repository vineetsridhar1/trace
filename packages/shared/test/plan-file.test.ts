import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPlanFileInstruction,
  createPlanFileWatcher,
  getPlanFilePath,
} from "../src/plan-file.js";
import {
  getTraceVisualPlanSkillPath,
  TRACE_VISUAL_PLAN_SKILL,
  validateTraceVisualPlan,
} from "../src/visual-plan-skill.js";

const sessionIds: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    sessionIds
      .splice(0)
      .map((sessionId) =>
        fs.promises.rm(path.dirname(getPlanFilePath(sessionId)), {
          force: true,
          recursive: true,
        }),
      ),
  );
});

describe("plan file", () => {
  it("builds a session-specific path and instruction", () => {
    const filePath = getPlanFilePath("session-123");
    expect(filePath).toContain("trace-plans/session-123/plan.mdx");
    expect(buildPlanFileInstruction(filePath)).toContain(filePath);
    expect(buildPlanFileInstruction(filePath)).toContain("Do not paste the plan into chat");
    expect(buildPlanFileInstruction(filePath)).toContain("Claude, Codex, Agy, Pi");
    expect(buildPlanFileInstruction(filePath)).toContain(getTraceVisualPlanSkillPath(filePath));
    expect(TRACE_VISUAL_PLAN_SKILL).toContain("# Agent-Native Plans");
    expect(createHash("sha256").update(TRACE_VISUAL_PLAN_SKILL).digest("hex")).toBe(
      "25c76d8f1c385c9e5ead466bf4270acef37222cf946dba48b1a21aac8211f77d",
    );
  });

  it("publishes changed non-empty snapshots once per content hash", async () => {
    const sessionId = `plan-file-${Date.now()}`;
    sessionIds.push(sessionId);
    const snapshots: string[] = [];
    const watcher = createPlanFileWatcher({
      sessionId,
      onSnapshot: (snapshot) => snapshots.push(snapshot.content),
    });

    const first = '# First\n<Callout id="choice" tone="decision">Use events.</Callout>\n';
    const second =
      '# Second\n<Checklist id="work" items={[{ id: "test", label: "Test it" }]} />\n';
    await fs.promises.writeFile(watcher.filePath, first, "utf8");
    await watcher.flush();
    await watcher.flush();
    await fs.promises.writeFile(watcher.filePath, second, "utf8");
    await watcher.flush();
    watcher.stop();

    expect(snapshots).toEqual([first, second]);
  });

  it("publishes invalid drafts with validation errors so the sidecar can open", async () => {
    const sessionId = `plan-file-invalid-${Date.now()}`;
    sessionIds.push(sessionId);
    const snapshots: Array<{ content: string; validationErrors: string[] }> = [];
    const watcher = createPlanFileWatcher({
      sessionId,
      onSnapshot: ({ content, validationErrors }) =>
        snapshots.push({ content, validationErrors }),
    });

    const content = "# Ordinary plan\n\n- Change the code\n";
    await fs.promises.writeFile(watcher.filePath, content, "utf8");
    await watcher.flush();
    watcher.stop();

    expect(snapshots).toEqual([
      {
        content,
        validationErrors: ["Use the structured Agent-Native Plan MDX block vocabulary."],
      },
    ]);
  });

  it("validates the structured Trace MDX contract", () => {
    expect(validateTraceVisualPlan("# Plain\n\nJust Markdown.")).toHaveLength(1);
    expect(
      validateTraceVisualPlan(
        '# Plan\n<Checklist id="checks" items={[{ id: "verify", label: "Verify" }]} />',
      ),
    ).toEqual([]);
    expect(
      validateTraceVisualPlan(
        '<AnnotatedCode language="ts" code={"const score = 3;" annotations={[]} />',
      ),
    ).toEqual([
      expect.stringContaining("Invalid MDX at line 1"),
    ]);
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
