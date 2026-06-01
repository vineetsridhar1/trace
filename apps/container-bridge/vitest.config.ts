import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const sharedSrc = fileURLToPath(new URL("../../packages/shared/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@trace/shared/animal-names": `${sharedSrc}animal-names.ts`,
      "@trace/shared": `${sharedSrc}index.ts`,
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
