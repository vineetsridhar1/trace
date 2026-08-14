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
    const parent = await mkdtemp(join(tmpdir(), "trace-runtime-test-"));
    roots.push(parent);

    const runtime = await ensureTraceRuntime(join(parent, "runtime"));

    expect(await readFile(join(runtime.binDir, "trace"), "utf8")).toContain("TRACE_NODE_BINARY");
    const browserVideoSkill = await readFile(
      join(runtime.skillsDir, "browser-video", "SKILL.md"),
      "utf8",
    );
    expect(browserVideoSkill).toContain("Choose one disposition");
    expect(browserVideoSkill).toContain("Browser-app fit");
    expect(browserVideoSkill).toContain("Third-party controllability");
    expect(browserVideoSkill).toContain("Reversible data plan");
    expect(browserVideoSkill).toContain('artifact push video "$TRACE_BROWSER_VIDEO_DIR');
    expect(browserVideoSkill).toContain("Never override the session name");
    expect(browserVideoSkill).toContain('"$TRACE_BROWSER_VIDEO_VALIDATE"');
    expect(
      await readFile(join(runtime.skillsDir, "request-user-input", "SKILL.md"), "utf8"),
    ).toContain("<trace:request-input");
    const traceSessionSkill = await readFile(
      join(runtime.skillsDir, "trace-session", "SKILL.md"),
      "utf8",
    );
    expect(traceSessionSkill).toContain("session list");
    expect(traceSessionSkill).toContain("session start");
    expect(traceSessionSkill).toContain("session convert --kind coding");
    expect(traceSessionSkill).toContain("Bare `session start` never joins");
    expect(traceSessionSkill).toContain("always win.");
    expect(traceSessionSkill).toContain("Do not call");
    expect(traceSessionSkill).toContain("idempotencyKey");
    expect(traceSessionSkill).toContain("--queue");
    const bundledCli = await readFile(join(runtime.binDir, "trace.mjs"), "utf8");
    expect(bundledCli).toContain("Commands:");
    expect(bundledCli).toContain("Convert the current general session into a specialized session");
  });

  it("replaces an older install so machines pick up changed skills", async () => {
    const parent = await mkdtemp(join(tmpdir(), "trace-runtime-test-"));
    roots.push(parent);
    const root = join(parent, "runtime");
    await mkdir(join(root, "skills", "trace-session"), { recursive: true });
    await writeFile(join(root, "manifest.json"), JSON.stringify({ version: 1 }), "utf8");
    await writeFile(join(root, "skills", "trace-session", "SKILL.md"), "stale skill", "utf8");

    const runtime = await ensureTraceRuntime(root);

    expect(
      await readFile(join(runtime.skillsDir, "trace-session", "SKILL.md"), "utf8"),
    ).not.toContain("stale skill");
    expect(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")).version).toBe(
      BUNDLED_TRACE_RUNTIME_MANIFEST.version,
    );
  });

  it("replaces a same-version install when its bundled content changed", async () => {
    const parent = await mkdtemp(join(tmpdir(), "trace-runtime-test-"));
    roots.push(parent);
    const root = join(parent, "runtime");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "manifest.json"),
      JSON.stringify({
        version: BUNDLED_TRACE_RUNTIME_MANIFEST.version,
        contentHash: "0".repeat(64),
      }),
      "utf8",
    );
    await writeFile(join(root, "marker"), "stale", "utf8");

    await ensureTraceRuntime(root);

    await expect(readFile(join(root, "marker"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")).contentHash).toBe(
      BUNDLED_TRACE_RUNTIME_MANIFEST.contentHash,
    );
  });

  it("leaves a current install alone", async () => {
    const parent = await mkdtemp(join(tmpdir(), "trace-runtime-test-"));
    roots.push(parent);
    const root = join(parent, "runtime");
    await mkdir(join(root, "skills"), { recursive: true });
    await writeFile(
      join(root, "manifest.json"),
      JSON.stringify({
        version: BUNDLED_TRACE_RUNTIME_MANIFEST.version,
        contentHash: BUNDLED_TRACE_RUNTIME_MANIFEST.contentHash,
      }),
      "utf8",
    );
    await writeFile(join(root, "marker"), "kept", "utf8");

    await ensureTraceRuntime(root);

    expect(await readFile(join(root, "marker"), "utf8")).toBe("kept");
  });
});
