export type PdfPageFormat = { width: number; height: number; unit: "mm" | "in" };

export const DEFAULT_PDF_PAGE_FORMAT: PdfPageFormat = {
  width: 210,
  height: 297,
  unit: "mm",
};

const MIN_PAGE_INCHES = 0.5;
const MAX_PAGE_INCHES = 200;

export function validatePdfPageFormat(value: unknown): PdfPageFormat {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PDF format must be an object");
  }
  const input = value as Record<string, unknown>;
  const { width, height, unit } = input;
  if (
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    (unit !== "mm" && unit !== "in")
  ) {
    throw new Error("PDF width, height, and unit are invalid");
  }
  const widthInches = unit === "mm" ? width / 25.4 : width;
  const heightInches = unit === "mm" ? height / 25.4 : height;
  if (
    widthInches < MIN_PAGE_INCHES ||
    heightInches < MIN_PAGE_INCHES ||
    widthInches > MAX_PAGE_INCHES ||
    heightInches > MAX_PAGE_INCHES
  ) {
    throw new Error("PDF dimensions must be between 0.5 and 200 inches");
  }
  return { width, height, unit };
}

export function parsePdfPageFormat(content: string): PdfPageFormat {
  return validatePdfPageFormat(JSON.parse(content));
}
