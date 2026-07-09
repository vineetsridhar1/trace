import { describe, expect, it } from "vitest";
import { TRACE_APP_STARTER_FILES } from "../src/app-starter.js";

function jsonFile(path: string) {
  const content = TRACE_APP_STARTER_FILES[path];
  if (!content) throw new Error(`Missing starter file ${path}`);
  return JSON.parse(content) as Record<string, unknown>;
}

describe("TRACE_APP_STARTER_FILES", () => {
  it("defines the standalone Next.js app runtime contract", () => {
    const pkg = jsonFile("package.json") as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const metadata = jsonFile(".trace/app-starter.json") as {
      framework?: string;
      packageManager?: string;
      devCommand?: string;
      previewPort?: number;
    };

    expect(metadata).toMatchObject({
      framework: "nextjs",
      packageManager: "pnpm",
      devCommand: "pnpm dev --hostname 0.0.0.0",
      previewPort: 3000,
    });
    expect(pkg.scripts).toMatchObject({
      dev: "next dev",
      build: "next build",
      start: "next start",
      typecheck: "tsc --noEmit",
    });
    expect(pkg.dependencies).toMatchObject({
      next: "latest",
      react: "latest",
      "react-dom": "latest",
      "lucide-react": "latest",
      "@radix-ui/react-slot": "latest",
    });
    expect(pkg.devDependencies).toMatchObject({
      tailwindcss: "latest",
      "@tailwindcss/postcss": "latest",
      typescript: "latest",
    });
  });

  it("includes shadcn-compatible primitives, source stamps, and an API persistence seam", () => {
    expect(TRACE_APP_STARTER_FILES["components.json"]).toContain(
      "https://ui.shadcn.com/schema.json",
    );
    expect(TRACE_APP_STARTER_FILES["components/ui/button.tsx"]).toContain(
      "class-variance-authority",
    );
    expect(TRACE_APP_STARTER_FILES["lib/utils.ts"]).toContain("twMerge");

    const page = TRACE_APP_STARTER_FILES["app/page.tsx"] ?? "";
    expect(page).toContain('data-trace-source="app/page.tsx:');
    expect(page).toContain("Trace app session");
    expect(page).toContain("checkpoint-friendly scripts");

    expect(TRACE_APP_STARTER_FILES["lib/persistence.ts"]).toContain("createItem");
    expect(TRACE_APP_STARTER_FILES["app/api/items/route.ts"]).toContain(
      "export async function GET",
    );
    expect(TRACE_APP_STARTER_FILES["app/api/items/route.ts"]).toContain(
      "export async function POST",
    );
  });
});
