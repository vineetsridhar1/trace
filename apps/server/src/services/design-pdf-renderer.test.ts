import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countPdfPages, designPdfRenderer } from "./design-pdf-renderer.js";

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

const execFileMock = vi.mocked(execFile);

function callbackFrom(args: unknown[]): ExecCallback {
  for (const arg of args) {
    if (typeof arg === "function") return arg as ExecCallback;
  }
  throw new Error("execFile callback was not provided");
}

function outputPathFrom(args: unknown[]): string {
  const commandArgs = args[1];
  if (!Array.isArray(commandArgs)) throw new Error("Chromium args missing");
  const pdfArg = commandArgs.find(
    (arg): arg is string => typeof arg === "string" && arg.startsWith("--print-to-pdf="),
  );
  if (!pdfArg) throw new Error("PDF output arg missing");
  return pdfArg.slice("--print-to-pdf=".length);
}

function inputPathFrom(args: unknown[]): string {
  const commandArgs = args[1];
  if (!Array.isArray(commandArgs)) throw new Error("Chromium args missing");
  const fileArg = commandArgs.find(
    (arg): arg is string => typeof arg === "string" && arg.startsWith("file://"),
  );
  if (!fileArg) throw new Error("HTML input arg missing");
  return fileArg.slice("file://".length);
}

function pathArtifactId(outputPath: string): string {
  return path.basename(outputPath, ".pdf");
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

describe("designPdfRenderer", () => {
  const originalExecutable = process.env.TRACE_CHROMIUM_EXECUTABLE;
  const originalConcurrency = process.env.TRACE_DESIGN_PDF_RENDER_CONCURRENCY;
  const originalQueueSize = process.env.TRACE_DESIGN_PDF_RENDER_QUEUE_SIZE;

  beforeEach(() => {
    process.env.TRACE_CHROMIUM_EXECUTABLE = "/usr/bin/chromium";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalExecutable === undefined) {
      delete process.env.TRACE_CHROMIUM_EXECUTABLE;
    } else {
      process.env.TRACE_CHROMIUM_EXECUTABLE = originalExecutable;
    }
    if (originalConcurrency === undefined) {
      delete process.env.TRACE_DESIGN_PDF_RENDER_CONCURRENCY;
    } else {
      process.env.TRACE_DESIGN_PDF_RENDER_CONCURRENCY = originalConcurrency;
    }
    if (originalQueueSize === undefined) {
      delete process.env.TRACE_DESIGN_PDF_RENDER_QUEUE_SIZE;
    } else {
      process.env.TRACE_DESIGN_PDF_RENDER_QUEUE_SIZE = originalQueueSize;
    }
  });

  it("renders HTML to a non-empty PDF buffer with Chromium", async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      fs.writeFileSync(outputPathFrom(args), Buffer.from("%PDF-1.7\n"));
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    const pdf = await designPdfRenderer.renderHtmlToPdf({
      artifactId: "artifact-1",
      html: "<main>Printable</main>",
    });

    expect(pdf).toEqual(Buffer.from("%PDF-1.7\n"));
    expect(execFileMock).toHaveBeenCalledWith(
      "/usr/bin/chromium",
      expect.arrayContaining([
        "--headless=new",
        "--host-resolver-rules=MAP * 0.0.0.0",
        expect.stringMatching(/^--user-data-dir=.*profile$/),
        expect.stringMatching(/^--print-to-pdf=/),
      ]),
      expect.objectContaining({ timeout: 30_000 }),
      expect.any(Function),
    );
  });

  it("wraps print HTML with a CSP that blocks scripts and external network fetches", async () => {
    let renderedInput = "";
    execFileMock.mockImplementation((...args: unknown[]) => {
      renderedInput = fs.readFileSync(inputPathFrom(args), "utf8");
      fs.writeFileSync(outputPathFrom(args), Buffer.from("%PDF-1.7\n"));
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    await designPdfRenderer.renderHtmlToPdf({
      artifactId: "artifact-1",
      html: '<main><img src="https://example.com/remote.png"><script>fetch("https://example.com")</script></main>',
    });

    expect(renderedInput).toContain('http-equiv="Content-Security-Policy"');
    expect(renderedInput).toContain("default-src 'none'");
    expect(renderedInput).toContain("script-src 'none'");
    expect(renderedInput).toContain("connect-src 'none'");
    expect(renderedInput).toContain("img-src data: blob:");
  });

  it("applies requested page size and margins in print CSS", async () => {
    let renderedInput = "";
    execFileMock.mockImplementation((...args: unknown[]) => {
      renderedInput = fs.readFileSync(inputPathFrom(args), "utf8");
      fs.writeFileSync(outputPathFrom(args), Buffer.from("%PDF-1.7\n"));
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    await designPdfRenderer.renderHtmlToPdf({
      artifactId: "artifact-1",
      html: "<main>Deck</main>",
      pageOptions: {
        widthPx: 1920,
        heightPx: 1080,
        marginTopPx: 24,
        marginRightPx: 32,
        marginBottomPx: 40,
        marginLeftPx: 48,
      },
    });

    expect(renderedInput).toContain("@page { size: 1920px 1080px; margin: 24px 32px 40px 48px; }");
  });

  it("rejects empty Chromium PDF output", async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      fs.writeFileSync(outputPathFrom(args), Buffer.alloc(0));
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    await expect(
      designPdfRenderer.renderHtmlToPdf({
        artifactId: "artifact-1",
        html: "<main>Empty</main>",
      }),
    ).rejects.toThrow("Chromium produced an empty PDF");
  });

  it("rejects non-PDF Chromium output", async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      fs.writeFileSync(outputPathFrom(args), Buffer.from("not a pdf"));
      callbackFrom(args)(null, "", "");
      return null as never;
    });

    await expect(
      designPdfRenderer.renderHtmlToPdf({
        artifactId: "artifact-1",
        html: "<main>Corrupt</main>",
      }),
    ).rejects.toThrow("Chromium produced a non-PDF export");
  });

  it("reserves render slots for queued PDF tasks instead of letting later tasks barge", async () => {
    process.env.TRACE_DESIGN_PDF_RENDER_CONCURRENCY = "1";
    process.env.TRACE_DESIGN_PDF_RENDER_QUEUE_SIZE = "4";
    vi.resetModules();
    const { designPdfRenderer: isolatedRenderer } = await import("./design-pdf-renderer.js");
    const started: string[] = [];
    const callbacks: ExecCallback[] = [];

    execFileMock.mockImplementation((...args: unknown[]) => {
      started.push(pathArtifactId(outputPathFrom(args)));
      fs.writeFileSync(outputPathFrom(args), Buffer.from("%PDF-1.7\n"));
      callbacks.push(callbackFrom(args));
      return null as never;
    });

    const first = isolatedRenderer.renderHtmlToPdf({
      artifactId: "artifact-1",
      html: "<main>First</main>",
    });
    const second = isolatedRenderer.renderHtmlToPdf({
      artifactId: "artifact-2",
      html: "<main>Second</main>",
    });
    const third = isolatedRenderer.renderHtmlToPdf({
      artifactId: "artifact-3",
      html: "<main>Third</main>",
    });

    await waitForAssertion(() => expect(started).toEqual(["artifact-1"]));
    callbacks[0](null, "", "");
    await waitForAssertion(() => expect(started).toEqual(["artifact-1", "artifact-2"]));
    callbacks[1](null, "", "");
    await waitForAssertion(() =>
      expect(started).toEqual(["artifact-1", "artifact-2", "artifact-3"]),
    );
    callbacks[2](null, "", "");

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      Buffer.from("%PDF-1.7\n"),
      Buffer.from("%PDF-1.7\n"),
      Buffer.from("%PDF-1.7\n"),
    ]);
  });

  it("counts concrete PDF page objects when available", () => {
    const pdf = Buffer.from(
      "%PDF-1.7\n1 0 obj <</Type /Pages /Count 2>> endobj\n2 0 obj <</Type /Page>> endobj\n3 0 obj <</Type /Page>> endobj\n",
      "latin1",
    );

    expect(countPdfPages(pdf)).toBe(2);
    expect(countPdfPages(Buffer.from("%PDF-1.7\n", "latin1"))).toBeNull();
  });
});
