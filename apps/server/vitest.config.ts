import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 70,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/context.ts",
        "src/lib/db.ts",
        // Runtime/bootstrap integration surfaces are better covered by a dedicated
        // integration harness than by unit-test coverage.
        "src/routes/**/*.ts",
        "src/schema/**/*.ts",
        "src/services/session.ts",
        "src/services/terminal.ts",
        "src/services/ai.ts",
        "src/lib/bridge-handler.ts",
        "src/lib/cloud-machine-provider.ts",
        "src/lib/cloud-machine-service.ts",
        "src/lib/fly-provider.ts",
        "src/lib/session-router.ts",
        "src/lib/terminal-handler.ts",
        "src/lib/terminal-relay.ts",
        "src/lib/llm/anthropic.ts",
        "src/lib/llm/openai.ts",
      ],
    },
  },
});
