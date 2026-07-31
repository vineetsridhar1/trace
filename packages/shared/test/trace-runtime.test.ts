import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureTraceRuntime } from "../src/trace-runtime.js";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("ensureTraceRuntime", () => {
  it("installs the bundled CLI and skills when GitHub is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const parent = await mkdtemp(join(tmpdir(), "trace-runtime-test-"));
    roots.push(parent);

    const runtime = await ensureTraceRuntime(join(parent, "runtime"));

    expect(await readFile(join(runtime.binDir, "trace"), "utf8")).toContain("TRACE_NODE_BINARY");
    expect(await readFile(join(runtime.skillsDir, "visual-plan", "SKILL.md"), "utf8")).toContain(
      "trace artifact push visual-plan",
    );
  });
});
