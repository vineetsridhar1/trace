import { describe, expect, it } from "vitest";
import { buildSessionRowAccessibilityLabel, describeSessionStatus } from "./accessibility";

describe("describeSessionStatus", () => {
  it("maps server statuses to spoken labels", () => {
    expect(describeSessionStatus("needs_input")).toBe("Needs input");
    expect(describeSessionStatus("in_progress")).toBe("In progress");
    expect(describeSessionStatus("merged")).toBe("Merged");
  });
});

describe("buildSessionRowAccessibilityLabel", () => {
  it("includes status, context, and action hint", () => {
    expect(
      buildSessionRowAccessibilityLabel({
        name: "Refactor auth middleware",
        status: "needs_input",
        secondaryLabel: "trace",
        preview: "Agent asked whether to keep legacy support",
        syncedBridgeLabel: "MacBook Pro",
      }),
    ).toBe(
      "Refactor auth middleware. Needs input. trace. Agent asked whether to keep legacy support. Synced to MacBook Pro. Double-tap to open.",
    );
  });
});
