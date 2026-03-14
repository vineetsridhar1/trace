import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  ignoreNoDocuments: true,
  schema: "src/schema.graphql",
  generates: {
    // Shared types (enums, inputs, object types) — used by both server and client
    "src/generated/types.ts": {
      plugins: ["typescript"],
      config: {
        // Keeps @trace/gql "no runtime code": enums become string unions instead
        // of emitted JS enums.
        enumsAsTypes: true,
        scalars: {
          DateTime: "string",
          JSON: "Record<string, unknown>",
        },
      },
    },
    // Server resolver types — used by @trace/server
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
    // Client hooks and document nodes — used by @trace/web
    "src/generated/client/": {
      preset: "client",
      documents: ["../../apps/web/src/**/*.tsx", "../../apps/web/src/**/*.ts"],
      config: {
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
