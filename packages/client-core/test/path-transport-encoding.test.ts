import { describe, expect, it } from "vitest";
import { encodePathVariables } from "../src/gql/pathTransportEncoding.js";

describe("encodePathVariables", () => {
  it("encodes path-traversal-looking strings in nested GraphQL variables", () => {
    const result = JSON.parse(
      encodePathVariables(
        JSON.stringify({
          query: "mutation Send($text: String!) { send(text: $text) }",
          variables: { text: "../../node_modules/vite/types/importMeta.d.ts:17:3", tags: ["ok"] },
        }),
      ),
    ) as { variables: { text: string; tags: string[] } };

    expect(result.variables.text).toMatch(/^\u0000trace-path-v1:[0-9a-f]+$/);
    expect(result.variables.text).not.toContain("../");
    expect(result.variables.tags).toEqual(["ok"]);
  });

  it("leaves requests without matching strings unchanged", () => {
    const body = JSON.stringify({ query: "query { me { id } }", variables: { id: "session-1" } });
    expect(encodePathVariables(body)).toBe(body);
  });
});
