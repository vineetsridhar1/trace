import { describe, expect, it } from "vitest";
import { buildDesignCommentInput } from "./DesignCommentPopover";

describe("buildDesignCommentInput", () => {
  it("trims comment body and preserves send-to-agent intent", () => {
    expect(buildDesignCommentInput("  Tighten the hero spacing.  ", true)).toEqual({
      body: "Tighten the hero spacing.",
      sendToAgent: true,
    });
  });

  it("rejects empty comment bodies", () => {
    expect(() => buildDesignCommentInput("   ", false)).toThrow("Comment body is required.");
  });
});
