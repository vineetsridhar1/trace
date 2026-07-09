import { execFile } from "child_process";
import fs from "fs";
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

describe("designPdfRenderer", () => {
  const originalExecutable = process.env.TRACE_CHROMIUM_EXECUTABLE;

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
      expect.arrayContaining(["--headless=new", expect.stringMatching(/^--print-to-pdf=/)]),
      expect.objectContaining({ timeout: 30_000 }),
      expect.any(Function),
    );
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

  it("counts concrete PDF page objects when available", () => {
    const pdf = Buffer.from(
      "%PDF-1.7\n1 0 obj <</Type /Pages /Count 2>> endobj\n2 0 obj <</Type /Page>> endobj\n3 0 obj <</Type /Page>> endobj\n",
      "latin1",
    );

    expect(countPdfPages(pdf)).toBe(2);
    expect(countPdfPages(Buffer.from("%PDF-1.7\n", "latin1"))).toBeNull();
  });
});
