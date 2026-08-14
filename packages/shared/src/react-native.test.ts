import { describe, expect, it } from "vitest";
import { isActionRequiredArtifact } from "./react-native.js";

describe("React Native shared exports", () => {
  it("exports the actionable artifact guard used by client-core", () => {
    expect(
      isActionRequiredArtifact({
        kind: "login_required",
        provider: "codex",
        title: "Sign in to Codex",
        description: "Your session needs authentication.",
      }),
    ).toBe(true);
  });
});
