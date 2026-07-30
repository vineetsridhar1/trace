import { describe, expect, it } from "vitest";
import {
  getSavedDesignPreviewRecoveryState,
  MAX_SAVED_DESIGN_PREVIEW_ATTEMPTS,
} from "./saved-design-preview-recovery";

const unavailableDesign = {
  projectKind: "design" as const,
  liveRuntimeAvailable: false,
  designPreviewUrl: null,
};

describe("getSavedDesignPreviewRecoveryState", () => {
  it("retries a dead design runtime while its saved preview is being prepared", () => {
    expect(
      getSavedDesignPreviewRecoveryState({ ...unavailableDesign, attempts: 0 }),
    ).toBe("retry");
  });

  it("stops retrying when the saved preview arrives", () => {
    expect(
      getSavedDesignPreviewRecoveryState({
        ...unavailableDesign,
        designPreviewUrl: "https://preview.test/design.html",
        attempts: 1,
      }),
    ).toBe("idle");
  });

  it("does not retry while a live runtime can serve the design", () => {
    expect(
      getSavedDesignPreviewRecoveryState({
        ...unavailableDesign,
        liveRuntimeAvailable: true,
        attempts: 1,
      }),
    ).toBe("idle");
  });

  it("shows an unavailable state after the bounded retry window", () => {
    expect(
      getSavedDesignPreviewRecoveryState({
        ...unavailableDesign,
        attempts: MAX_SAVED_DESIGN_PREVIEW_ATTEMPTS,
      }),
    ).toBe("unavailable");
  });
});
