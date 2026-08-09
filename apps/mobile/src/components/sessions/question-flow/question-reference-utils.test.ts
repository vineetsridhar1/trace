import { describe, expect, it } from "vitest";
import {
  acceptsQuestionReference,
  documentPickerTypes,
  filenameFromReferenceUri,
} from "./question-reference-utils";

describe("question reference utilities", () => {
  it("accepts configured MIME wildcards and extensions", () => {
    expect(acceptsQuestionReference("photo.heic", "image/heic", "image/*,.pdf")).toBe(true);
    expect(acceptsQuestionReference("brief.pdf", "application/octet-stream", "image/*,.pdf")).toBe(true);
    expect(acceptsQuestionReference("notes.txt", "text/plain", "image/*,.pdf")).toBe(false);
  });

  it("maps accepted extensions to document picker MIME types", () => {
    expect(documentPickerTypes("image/*,.pdf")).toEqual(["image/*", "application/pdf"]);
  });

  it("decodes a filename from a local URI", () => {
    expect(filenameFromReferenceUri("file:///tmp/Product%20brief.pdf", "Reference")).toBe(
      "Product brief.pdf",
    );
  });
});
