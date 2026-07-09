import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listTraceDesignPromptContent, loadTraceDesignPromptContent } from "./design-content.js";

async function makeContentRoot() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-design-content-"));
  await fs.promises.mkdir(path.join(root, "design-systems", "trace-core"), {
    recursive: true,
  });
  await fs.promises.mkdir(path.join(root, "skills", "forms"), {
    recursive: true,
  });
  await fs.promises.writeFile(
    path.join(root, "design-systems", "trace-core", "manifest.json"),
    JSON.stringify({
      id: "trace-core",
      name: "Trace Core",
      description: "Trace product interface system",
    }),
  );
  await fs.promises.writeFile(
    path.join(root, "design-systems", "trace-core", "DESIGN.md"),
    "Use compact operational layouts.",
  );
  await fs.promises.writeFile(
    path.join(root, "design-systems", "trace-core", "tokens.css"),
    ":root { --trace-primary: #2563eb; }",
  );
  await fs.promises.writeFile(
    path.join(root, "design-systems", "trace-core", "USAGE.md"),
    "Prefer dense tables for admin workflows.",
  );
  await fs.promises.writeFile(
    path.join(root, "design-systems", "trace-core", "components.manifest.json"),
    JSON.stringify({ components: ["Button"] }),
  );
  await fs.promises.writeFile(
    path.join(root, "skills", "forms", "SKILL.md"),
    "# Forms\n\nUse explicit labels and validation messages.",
  );
  await fs.promises.writeFile(
    path.join(root, "skills", "audit.md"),
    "# Audit\n\nCheck visual hierarchy before finalizing.",
  );
  return root;
}

describe("loadTraceDesignPromptContent", () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(roots.splice(0).map((root) => fs.promises.rm(root, { recursive: true })));
  });

  it("loads upstream-shaped design system and skill content from configured roots", async () => {
    const root = await makeContentRoot();
    roots.push(root);
    vi.stubEnv("TRACE_DESIGN_CONTENT_DIRS", root);

    const content = loadTraceDesignPromptContent({
      designSystemId: "trace-core",
      skillIds: ["forms"],
    });

    expect(content.designSystem).toMatchObject({
      id: "trace-core",
      name: "Trace Core",
      design: "Use compact operational layouts.",
      tokensCss: ":root { --trace-primary: #2563eb; }",
      usage: "Prefer dense tables for admin workflows.",
      componentsManifest: { components: ["Button"] },
    });
    expect(content.skills).toEqual([
      {
        id: "forms",
        title: "Forms",
        body: "# Forms\n\nUse explicit labels and validation messages.",
      },
    ]);
  });

  it("returns empty content when no content roots are configured", () => {
    expect(
      loadTraceDesignPromptContent({ designSystemId: "trace-core", skillIds: ["forms"] }),
    ).toEqual({});
  });

  it("lists configured design systems and skills for picker UIs", async () => {
    const root = await makeContentRoot();
    roots.push(root);
    vi.stubEnv("TRACE_DESIGN_CONTENT_DIRS", root);

    expect(listTraceDesignPromptContent()).toEqual({
      designSystems: [
        {
          id: "trace-core",
          name: "Trace Core",
          description: "Trace product interface system",
        },
      ],
      skills: [
        {
          id: "audit",
          title: "Audit",
          description: "Check visual hierarchy before finalizing.",
        },
        {
          id: "forms",
          title: "Forms",
          description: "Use explicit labels and validation messages.",
        },
      ],
    });
  });

  it("deduplicates catalog entries across content roots", async () => {
    const firstRoot = await makeContentRoot();
    const secondRoot = await makeContentRoot();
    roots.push(firstRoot, secondRoot);
    vi.stubEnv("TRACE_DESIGN_CONTENT_DIRS", [firstRoot, secondRoot].join(path.delimiter));

    expect(listTraceDesignPromptContent().designSystems).toHaveLength(1);
    expect(listTraceDesignPromptContent().skills).toHaveLength(2);
  });
});
