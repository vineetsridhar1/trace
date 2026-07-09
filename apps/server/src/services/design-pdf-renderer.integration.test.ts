import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countPdfPages, designPdfRenderer } from "./design-pdf-renderer.js";

const CHROME_CANDIDATES = [
  process.env.TRACE_CHROMIUM_EXECUTABLE,
  process.env.CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

function findChromeExecutable(): string | null {
  return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

describe("designPdfRenderer integration", () => {
  const originalExecutable = process.env.TRACE_CHROMIUM_EXECUTABLE;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalExecutable === undefined) {
      delete process.env.TRACE_CHROMIUM_EXECUTABLE;
    } else {
      process.env.TRACE_CHROMIUM_EXECUTABLE = originalExecutable;
    }
  });

  const chromeExecutable = findChromeExecutable();
  const runIfChrome = chromeExecutable ? it : it.skip;

  runIfChrome(
    "renders real HTML to a PDF with headless Chromium",
    async () => {
      vi.stubEnv("TRACE_CHROMIUM_EXECUTABLE", chromeExecutable ?? "");
      vi.stubEnv("TRACE_DESIGN_PDF_RENDER_TIMEOUT_MS", "30000");

      const pdf = await designPdfRenderer.renderHtmlToPdf({
        artifactId: "artifact-real",
        html: `
        <main style="width: 720px; padding: 32px; font-family: Arial, sans-serif;">
          <h1>Trace design export</h1>
          <p data-el="summary">Printable artifact content</p>
        </main>
      `,
      });

      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(pdf.byteLength).toBeGreaterThan(1_000);
      expect(countPdfPages(pdf)).toBeGreaterThanOrEqual(1);
    },
    30_000,
  );
});
