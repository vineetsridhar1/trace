import { describe, expect, it } from "vitest";
import { pdfExportChromiumArgs } from "./pdf-export.js";

describe("pdfExportChromiumArgs", () => {
  it("uses the container-compatible Chromium flags", () => {
    expect(pdfExportChromiumArgs(4173, "/tmp/document.pdf", "/tmp/profile")).toEqual([
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--user-data-dir=/tmp/profile",
      "--print-to-pdf-no-header",
      "--print-to-pdf=/tmp/document.pdf",
      "http://127.0.0.1:4173",
    ]);
  });
});
