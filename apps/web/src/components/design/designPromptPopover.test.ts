import { describe, expect, it } from "vitest";
import { buildDesignPromptInput } from "./DesignPromptPopover";

describe("buildDesignPromptInput", () => {
  it("trims prompt text", () => {
    expect(buildDesignPromptInput("  Create three CRM dashboard directions.  ")).toEqual({
      prompt: "Create three CRM dashboard directions.",
    });
  });

  it("rejects empty prompts", () => {
    expect(() => buildDesignPromptInput("   ")).toThrow("Prompt is required.");
  });
});
