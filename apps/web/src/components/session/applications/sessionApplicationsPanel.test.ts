import { describe, expect, it } from "vitest";
import { parseAppTokenPatchInput } from "./SessionApplicationsPanel";

describe("parseAppTokenPatchInput", () => {
  it("accepts JSON object token patches", () => {
    expect(parseAppTokenPatchInput('{"color":{"primary":"#ef4444"}}')).toEqual({
      color: { primary: "#ef4444" },
    });
  });

  it("rejects non-object token patches", () => {
    expect(() => parseAppTokenPatchInput("[]")).toThrow("Token patch must be a JSON object.");
    expect(() => parseAppTokenPatchInput('"bad"')).toThrow("Token patch must be a JSON object.");
  });
});
