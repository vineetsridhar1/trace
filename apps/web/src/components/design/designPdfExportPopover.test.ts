import { describe, expect, it } from "vitest";
import { buildDesignPdfPageOptions } from "./DesignPdfExportPopover";

describe("buildDesignPdfPageOptions", () => {
  it("returns null for default PDF export options", () => {
    expect(
      buildDesignPdfPageOptions({
        widthPx: "",
        heightPx: "",
        marginTopPx: "",
        marginRightPx: "",
        marginBottomPx: "",
        marginLeftPx: "",
      }),
    ).toBeNull();
  });

  it("builds explicit page size and margin options", () => {
    expect(
      buildDesignPdfPageOptions({
        widthPx: "1440",
        heightPx: "1080",
        marginTopPx: "0",
        marginRightPx: "24",
        marginBottomPx: "32",
        marginLeftPx: "24",
      }),
    ).toEqual({
      widthPx: 1440,
      heightPx: 1080,
      marginTopPx: 0,
      marginRightPx: 24,
      marginBottomPx: 32,
      marginLeftPx: 24,
    });
  });

  it("requires width and height together", () => {
    expect(() =>
      buildDesignPdfPageOptions({
        widthPx: "1440",
        heightPx: "",
        marginTopPx: "",
        marginRightPx: "",
        marginBottomPx: "",
        marginLeftPx: "",
      }),
    ).toThrow("Width and height must be provided together.");
  });

  it("rejects out-of-range margins", () => {
    expect(() =>
      buildDesignPdfPageOptions({
        widthPx: "",
        heightPx: "",
        marginTopPx: "1001",
        marginRightPx: "",
        marginBottomPx: "",
        marginLeftPx: "",
      }),
    ).toThrow("Top margin must be an integer from 0 to 1000.");
  });
});
