import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const DEFAULT_RENDER_TIMEOUT_MS = 30_000;
const DEFAULT_RENDER_CONCURRENCY = 2;
const DEFAULT_RENDER_QUEUE_SIZE = 16;
const PDF_OUTPUT_POLL_INTERVAL_MS = 100;

type RenderTask<T> = () => Promise<T>;

export type DesignPdfPageOptions = {
  widthPx?: number | null;
  heightPx?: number | null;
  marginTopPx?: number | null;
  marginRightPx?: number | null;
  marginBottomPx?: number | null;
  marginLeftPx?: number | null;
};

class BoundedRenderPool {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly concurrency = readPositiveInt(
      process.env.TRACE_DESIGN_PDF_RENDER_CONCURRENCY,
      DEFAULT_RENDER_CONCURRENCY,
    ),
    private readonly maxQueueSize = readPositiveInt(
      process.env.TRACE_DESIGN_PDF_RENDER_QUEUE_SIZE,
      DEFAULT_RENDER_QUEUE_SIZE,
    ),
  ) {}

  async run<T>(task: RenderTask<T>): Promise<T> {
    await this.acquireSlot();
    try {
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.active < this.concurrency && this.queue.length === 0) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error("Design PDF render queue is full");
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private releaseSlot() {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function chromiumExecutable(): string {
  return (
    process.env.TRACE_CHROMIUM_EXECUTABLE?.trim() ||
    process.env.CHROMIUM_EXECUTABLE_PATH?.trim() ||
    "chromium"
  );
}

function chromeArgs(input: {
  inputPath: string;
  outputPath: string;
  userDataDir: string;
}): string[] {
  return [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${input.userDataDir}`,
    "--host-resolver-rules=MAP * 0.0.0.0",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1000",
    `--print-to-pdf=${input.outputPath}`,
    `file://${input.inputPath}`,
  ];
}

function printRenderCsp(): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "script-src 'none'",
    "connect-src 'none'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "style-src 'unsafe-inline'",
  ].join("; ");
}

function pageCss(options?: DesignPdfPageOptions | null): string {
  const size =
    options?.widthPx && options.heightPx
      ? ` size: ${options.widthPx}px ${options.heightPx}px;`
      : "";
  const margins = [
    options?.marginTopPx ?? 0,
    options?.marginRightPx ?? 0,
    options?.marginBottomPx ?? 0,
    options?.marginLeftPx ?? 0,
  ];
  return `@page {${size} margin: ${margins.map((value) => `${value}px`).join(" ")}; }`;
}

function wrapPrintHtml(html: string, pageOptions?: DesignPdfPageOptions | null): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${printRenderCsp()}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    ${pageCss(pageOptions)}
    html, body { margin: 0; background: white; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

function isPdf(buffer: Buffer): boolean {
  return buffer.byteLength >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

async function readStablePdf(
  outputPath: string,
  previousSize: number | null,
): Promise<Buffer | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(outputPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (stat.size === 0 || stat.size !== previousSize) {
    return null;
  }
  const pdf = await fs.promises.readFile(outputPath);
  return isPdf(pdf) ? pdf : null;
}

function renderWithChromium(input: {
  executable: string;
  args: string[];
  outputPath: string;
  timeoutMs: number;
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    let lastObservedSize: number | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const child = execFile(
      input.executable,
      input.args,
      { timeout: input.timeoutMs, maxBuffer: 1024 * 1024 },
      (error) => {
        if (settled) return;
        if (error) {
          settleReject(error);
          return;
        }
        void readFinalPdf().then(settleResolve, settleReject);
      },
    );

    function clearTimers() {
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      pollTimer = null;
      timeoutTimer = null;
    }

    function terminateChild(): Promise<void> {
      if (
        !child ||
        typeof child.kill !== "function" ||
        child.killed ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let resolved = false;
        let killTimer: ReturnType<typeof setTimeout> | null = null;
        const done = () => {
          if (resolved) return;
          resolved = true;
          if (killTimer) clearTimeout(killTimer);
          resolve();
        };
        child.once("exit", done);
        child.once("close", done);
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!child.killed && child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
          setTimeout(done, 500);
        }, 1_000);
      });
    }

    function settleResolve(pdf: Buffer) {
      if (settled) return;
      settled = true;
      clearTimers();
      void terminateChild().then(
        () => resolve(pdf),
        () => resolve(pdf),
      );
    }

    function settleReject(error: unknown) {
      if (settled) return;
      settled = true;
      clearTimers();
      void terminateChild().then(
        () => reject(error),
        () => reject(error),
      );
    }

    async function readFinalPdf(): Promise<Buffer> {
      const pdf = await fs.promises.readFile(input.outputPath);
      if (pdf.byteLength === 0) {
        throw new Error("Chromium produced an empty PDF");
      }
      if (!isPdf(pdf)) {
        throw new Error("Chromium produced a non-PDF export");
      }
      return pdf;
    }

    async function pollForOutput() {
      if (settled) return;
      try {
        const stat = await fs.promises.stat(input.outputPath).catch((error: unknown) => {
          if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return null;
          }
          throw error;
        });
        const stablePdf =
          stat && stat.size > 0 ? await readStablePdf(input.outputPath, lastObservedSize) : null;
        lastObservedSize = stat?.size ?? null;
        if (stablePdf) {
          settleResolve(stablePdf);
          return;
        }
        pollTimer = setTimeout(() => void pollForOutput(), PDF_OUTPUT_POLL_INTERVAL_MS);
      } catch (error) {
        settleReject(error);
      }
    }

    timeoutTimer = setTimeout(() => {
      settleReject(new Error(`Chromium PDF render timed out after ${input.timeoutMs}ms`));
    }, input.timeoutMs);
    pollTimer = setTimeout(() => void pollForOutput(), PDF_OUTPUT_POLL_INTERVAL_MS);
  });
}

export function countPdfPages(pdf: Buffer): number | null {
  const text = pdf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches && matches.length > 0 ? matches.length : null;
}

const renderPool = new BoundedRenderPool();

export const designPdfRenderer = {
  async renderHtmlToPdf(input: {
    html: string;
    artifactId: string;
    pageOptions?: DesignPdfPageOptions | null;
  }): Promise<Buffer> {
    return renderPool.run(async () => {
      const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-design-pdf-"));
      const inputPath = path.join(workdir, `${input.artifactId}.html`);
      const outputPath = path.join(workdir, `${input.artifactId}.pdf`);
      const userDataDir = path.join(workdir, "profile");

      try {
        await fs.promises.writeFile(
          inputPath,
          wrapPrintHtml(input.html, input.pageOptions ?? null),
          "utf8",
        );
        return await renderWithChromium({
          executable: chromiumExecutable(),
          args: chromeArgs({ inputPath, outputPath, userDataDir }),
          outputPath,
          timeoutMs: readPositiveInt(
            process.env.TRACE_DESIGN_PDF_RENDER_TIMEOUT_MS,
            DEFAULT_RENDER_TIMEOUT_MS,
          ),
        });
      } finally {
        await fs.promises.rm(workdir, { recursive: true, force: true });
      }
    });
  },
};
