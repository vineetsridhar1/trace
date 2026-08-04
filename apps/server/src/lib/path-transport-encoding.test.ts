import { describe, expect, it } from "vitest";
import { decodePathVariables } from "./path-transport-encoding.js";

describe("decodePathVariables", () => {
  it("restores encoded paths in nested GraphQL variables", () => {
    const body: { variables: { text: string; nested: { values: string[] } } } = {
      variables: {
        text: "\u0000trace-path-v1:2e2e2f2e2e2f6e6f64655f6d6f64756c6573",
        nested: { values: ["\u0000trace-path-v1:2e2f737263"] },
      },
    };

    decodePathVariables(body);

    expect(body.variables).toEqual({ text: "../../node_modules", nested: { values: ["./src"] } });
  });

  it("does not alter malformed encoded values", () => {
    const body = { variables: { text: "\u0000trace-path-v1:not-hex" } };
    decodePathVariables(body);
    expect(body.variables.text).toBe("\u0000trace-path-v1:not-hex");
  });
});
