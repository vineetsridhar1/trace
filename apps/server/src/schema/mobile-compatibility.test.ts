import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildSchema, parse, validate } from "graphql";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const schema = buildSchema(readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8"));

describe("mobile GraphQL compatibility", () => {
  it("accepts the legacy design-system argument when changing a session runtime", () => {
    const document = parse(`
      mutation UpdateSessionConfig(
        $sessionId: ID!
        $tool: CodingTool
        $model: String
        $reasoningEffort: String
        $hosting: HostingMode
        $runtimeInstanceId: ID
        $designSystemVersionId: ID
      ) {
        updateSessionConfig(
          sessionId: $sessionId
          tool: $tool
          model: $model
          reasoningEffort: $reasoningEffort
          hosting: $hosting
          runtimeInstanceId: $runtimeInstanceId
          designSystemVersionId: $designSystemVersionId
        ) {
          id
          tool
          model
          reasoningEffort
          hosting
          connection {
            state
            runtimeInstanceId
            runtimeLabel
          }
        }
      }
    `);

    expect(validate(schema, document)).toEqual([]);
  });
});
