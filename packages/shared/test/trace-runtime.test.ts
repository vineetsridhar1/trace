import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureTraceRuntime } from "../src/trace-runtime.js";
import { BUNDLED_TRACE_RUNTIME_MANIFEST } from "../src/trace-runtime.generated.js";

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

  it("replaces an older install so machines pick up changed skills", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const parent = await mkdtemp(join(tmpdir(), "trace-runtime-test-"));
    roots.push(parent);
    const root = join(parent, "runtime");
    await mkdir(join(root, "skills", "visual-plan"), { recursive: true });
    await writeFile(join(root, "manifest.json"), JSON.stringify({ version: 1 }), "utf8");
    await writeFile(join(root, "skills", "visual-plan", "SKILL.md"), "stale skill", "utf8");

    const runtime = await ensureTraceRuntime(root);

    expect(
      await readFile(join(runtime.skillsDir, "visual-plan", "SKILL.md"), "utf8"),
    ).not.toContain("stale skill");
    expect(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")).version).toBe(
      BUNDLED_TRACE_RUNTIME_MANIFEST.version,
    );
  });

  it("leaves a current install alone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const parent = await mkdtemp(join(tmpdir(), "trace-runtime-test-"));
    roots.push(parent);
    const root = join(parent, "runtime");
    await mkdir(join(root, "skills"), { recursive: true });
    await writeFile(
      join(root, "manifest.json"),
      JSON.stringify({ version: BUNDLED_TRACE_RUNTIME_MANIFEST.version }),
      "utf8",
    );
    await writeFile(join(root, "marker"), "kept", "utf8");

    await ensureTraceRuntime(root);

    expect(await readFile(join(root, "marker"), "utf8")).toBe("kept");
  });
});
