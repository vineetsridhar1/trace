import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/schema.graphql",
  generates: {
    "src/generated/types.ts": {
      plugins: ["typescript"],
      config: {
        enumsAsTypes: true,
        scalars: {
          DateTime: "string",
          JSON: "Record<string, unknown>",
        },
      },
    },
    "src/generated/resolvers.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        useIndexSignature: true,
        contextType: "../context#Context",
        enumsAsTypes: true,
        scalars: {
          DateTime: "string",
          JSON: "Record<string, unknown>",
        },
      },
    },
  },
};

export default config;
