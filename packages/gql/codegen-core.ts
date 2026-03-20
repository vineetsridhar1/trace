import type { CodegenConfig } from "@graphql-codegen/cli";

const scalars = {
  DateTime: "string",
  JSON: "../json#JsonValue",
} as const;

const config: CodegenConfig = {
  schema: "src/schema.graphql",
  generates: {
    "src/generated/types.ts": {
      plugins: ["typescript"],
      config: {
        enumsAsTypes: true,
        scalars,
      },
    },
    "src/generated/resolvers.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        useIndexSignature: true,
        contextType: "../context#Context",
        enumsAsTypes: true,
        scalars,
      },
    },
  },
};

export default config;
