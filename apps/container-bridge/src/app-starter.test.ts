import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readStarterFile(path: string): string {
  return readFileSync(new URL(`../app-starter/${path}`, import.meta.url), "utf8");
}

describe("app starter styling", () => {
  it("loads the shared design-craft skill for interface work", () => {
    expect(readStarterFile("docs/ai-guidance.md")).toContain(
      "$TRACE_SKILLS_DIR/design-craft/SKILL.md",
    );
  });

  it("loads Tailwind through the Vite module graph", () => {
    expect(readStarterFile("src/main.tsx")).toContain('import "./index.css";');
    expect(readStarterFile("index.html")).toContain(
      '<link rel="stylesheet" href="/src/index.css" />',
    );
    expect(readStarterFile("src/index.css")).toContain(
      "@tailwind base;\n@tailwind components;\n@tailwind utilities;",
    );
    expect(readStarterFile("tailwind.config.ts")).toContain(
      'content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]',
    );
    expect(readStarterFile("postcss.config.cjs")).toContain(
      "plugins: { tailwindcss: {}, autoprefixer: {} }",
    );
  });

  it("provides generic and Snowflake server-only integration helpers", () => {
    const helper = readStarterFile("trace.ts");
    expect(helper).toContain("integrations:");
    expect(helper).toContain("snowflake:");
    expect(helper).toContain("request: integrationRequest");
    expect(helper).toContain("x-trace-app-viewer-context");
    expect(helper).toContain("/runtime/app-integrations/");
    const docs = readStarterFile("docs/trace-apps.md");
    expect(docs).toContain('trace.integrations.request(request, "github"');
    expect(docs).toContain("trace.integrations.snowflake.query");
  });
});
