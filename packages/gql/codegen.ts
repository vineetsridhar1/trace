import type { CodegenConfig } from "@graphql-codegen/cli";

const scalars = {
  DateTime: "string",
  JSON: "../json#JsonValue",
} as const;

const clientScalars = {
  DateTime: "string",
  JSON: "../../json#JsonValue",
} as const;

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
        scalars,
      },
    },
    // Server resolver types — used by @trace/server
    "src/generated/resolvers.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        useIndexSignature: true,
        contextType: "../context#Context",
        enumsAsTypes: true,
        scalars,
      },
    },
    // Client hooks and document nodes — used by @trace/web
    "src/generated/client/": {
      preset: "client",
      documents: ["../../apps/web/src/**/*.tsx", "../../apps/web/src/**/*.ts"],
      config: {
        enumsAsTypes: true,
        scalars: clientScalars,
      },
    },
  },
};

export default config;
