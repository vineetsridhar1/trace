import { describe, expect, it } from "vitest";
import { parsePdfPageFormat, validatePdfPageFormat } from "./pdf-format.js";

describe("PDF page format", () => {
  it("accepts supported dimensions and units", () => {
    expect(parsePdfPageFormat('{"width":297,"height":297,"unit":"mm"}')).toEqual({
      width: 297,
      height: 297,
      unit: "mm",
    });
  });

  it.each([
    { width: 0, height: 11, unit: "in" },
    { width: 8.5, height: 201, unit: "in" },
    { width: Number.NaN, height: 297, unit: "mm" },
    { width: 210, height: 297, unit: "px" },
  ])("rejects unsafe dimensions: %o", (format) => {
    expect(() => validatePdfPageFormat(format)).toThrow();
  });
});
