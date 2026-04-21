import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/", "**/node_modules/", "**/generated/", "**/*.js", "**/*.mjs"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["packages/client-core/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-dom",
              message: "@trace/client-core must stay platform-agnostic.",
            },
          ],
          patterns: [
            {
              group: ["react-dom/*"],
              message: "@trace/client-core must stay platform-agnostic.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message: "@trace/client-core must stay platform-agnostic — use the Platform interface.",
        },
        {
          name: "document",
          message: "@trace/client-core must stay platform-agnostic — use the Platform interface.",
        },
        {
          name: "localStorage",
          message: "@trace/client-core must stay platform-agnostic — use Platform.storage.",
        },
        {
          name: "sessionStorage",
          message: "@trace/client-core must stay platform-agnostic — use Platform.storage.",
        },
      ],
    },
  },
);
