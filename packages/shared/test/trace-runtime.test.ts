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
    const designCraftSkill = await readFile(
      join(runtime.skillsDir, "design-craft", "SKILL.md"),
      "utf8",
    );
    expect(designCraftSkill).toContain("App session");
    expect(designCraftSkill).toContain("Design session");
    expect(designCraftSkill).toContain("Do not introduce a generic page detector");
    expect(designCraftSkill).toContain("references/new-work.md");
    expect(designCraftSkill).toContain("references/operate.md");
    expect(designCraftSkill).toContain("references/critique.md");
    expect(designCraftSkill).toContain("references/harden.md");
    expect(
      await readFile(
        join(runtime.skillsDir, "design-craft", "references", "design-method.md"),
        "utf8",
      ),
    ).toContain("Establish visual authority");
    expect(
      await readFile(
        join(runtime.skillsDir, "design-craft", "references", "refinement-actions.md"),
        "utf8",
      ),
    ).toContain("| Bolder |");
    expect(
      await readFile(
        join(runtime.skillsDir, "design-craft", "references", "review-and-resilience.md"),
        "utf8",
      ),
    ).toContain("exclude canvas chrome");
    expect(
      await readFile(join(runtime.skillsDir, "design-craft", "references", "critique.md"), "utf8"),
    ).toContain("Run independent passes");
    expect(
      await readFile(join(runtime.skillsDir, "design-craft", "references", "harden.md"), "utf8"),
    ).toContain("Hardening Dimensions");
    const bolderReference = await readFile(
      join(runtime.skillsDir, "design-craft", "references", "bolder.md"),
      "utf8",
    );
    expect(bolderReference).toContain("Trace's normal question mechanism");
    expect(bolderReference).not.toContain("Codex's structured user-input");
    const operateReference = await readFile(
      join(runtime.skillsDir, "design-craft", "references", "operate.md"),
      "utf8",
    );
    expect(operateReference).toContain("[design-method.md](design-method.md)");
    expect(operateReference).toContain("mode-specific guidance narrows a general craft-floor rule");
    expect(operateReference).toContain("replacing native scrollbar behavior");
    expect(
      await readFile(join(runtime.skillsDir, "design-craft", "LICENSE.txt"), "utf8"),
    ).toContain("Apache License");
    const visualPlanSkill = await readFile(
      join(runtime.skillsDir, "visual-plan", "SKILL.md"),
      "utf8",
    );
    expect(visualPlanSkill).toContain('"$TRACE_CLI" artifact push visual-plan');
    expect(visualPlanSkill).toContain("supplied canvas template");
    expect(visualPlanSkill).toContain("documentation directory");
    expect(visualPlanSkill).toContain("docs/session-artifact-upload-plan/");
    expect(visualPlanSkill).toContain("Upload the repository folder directly");
    expect(visualPlanSkill).toContain("Do not create a staging directory");
    expect(visualPlanSkill).toContain("Trace renders the uploaded artifact");
    expect(visualPlanSkill).toContain("Trace does not watch the repository");
    expect(visualPlanSkill).not.toContain("Agent-Native Plans");
    expect(
      await readFile(join(runtime.skillsDir, "visual-plan", "template.html"), "utf8"),
    ).toContain("agent's authoring canvas");
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
    expect(bundledCli).toContain("Command groups:");
    expect(bundledCli).toContain("integration list --json");
    expect(bundledCli).toContain("Convert the current general session into a coding session");
    await expect(
      readFile(join(runtime.skillsDir, "trace-integrations", "SKILL.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("replaces an older install so machines pick up changed skills", async () => {
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
