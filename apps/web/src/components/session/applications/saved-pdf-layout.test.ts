import { describe, expect, it } from "vitest";
import { layoutSavedPdfPages } from "./saved-pdf-layout";

describe("layoutSavedPdfPages", () => {
  it("keeps every PDF page in the pannable canvas", () => {
    expect(
      layoutSavedPdfPages(
        [
          { width: 612, height: 792 },
          { width: 612, height: 792 },
          { width: 595, height: 842 },
        ],
        24,
      ),
    ).toEqual({ height: 2474, offsets: [0, 816, 1632], width: 612 });
  });

  it("returns an empty canvas for a PDF with no pages", () => {
    expect(layoutSavedPdfPages([], 24)).toEqual({ height: 0, offsets: [], width: 0 });
  });
});
