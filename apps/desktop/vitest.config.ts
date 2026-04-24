import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@trace\/shared\/(.+)$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/$1.ts"),
      },
      {
        find: /^@trace\/shared$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
