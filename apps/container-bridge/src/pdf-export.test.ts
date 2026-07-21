import { describe, expect, it } from "vitest";
import { pdfExportChromiumArgs } from "./pdf-export.js";

describe("pdfExportChromiumArgs", () => {
  it("uses the container-compatible Chromium flags", () => {
    expect(
      pdfExportChromiumArgs(4173, "/tmp/document.pdf", "/tmp/profile", {
        width: 210,
        height: 297,
        unit: "mm",
      }),
    ).toEqual([
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--window-size=794,1123",
      "--user-data-dir=/tmp/profile",
      "--print-to-pdf-no-header",
      "--print-to-pdf=/tmp/document.pdf",
      "http://127.0.0.1:4173",
    ]);
  });

  it("matches an inch-based document's live preview width", () => {
    expect(
      pdfExportChromiumArgs(4173, "/tmp/document.pdf", "/tmp/profile", {
        width: 8.5,
        height: 11,
        unit: "in",
      }),
    ).toContain("--window-size=816,1056");
  });
});
