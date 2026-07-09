import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const DEFAULT_RENDER_TIMEOUT_MS = 30_000;
const DEFAULT_RENDER_CONCURRENCY = 2;
const DEFAULT_RENDER_QUEUE_SIZE = 16;

type RenderTask<T> = () => Promise<T>;

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
    if (this.active >= this.concurrency) {
      if (this.queue.length >= this.maxQueueSize) {
        throw new Error("Design PDF render queue is full");
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
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

function chromeArgs(inputPath: string, outputPath: string): string[] {
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
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1000",
    `--print-to-pdf=${outputPath}`,
    `file://${inputPath}`,
  ];
}

function wrapPrintHtml(html: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { margin: 0; }
    html, body { margin: 0; background: white; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

const renderPool = new BoundedRenderPool();

export const designPdfRenderer = {
  async renderHtmlToPdf(input: { html: string; artifactId: string }): Promise<Buffer> {
    return renderPool.run(async () => {
      const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-design-pdf-"));
      const inputPath = path.join(workdir, `${input.artifactId}.html`);
      const outputPath = path.join(workdir, `${input.artifactId}.pdf`);

      try {
        await fs.promises.writeFile(inputPath, wrapPrintHtml(input.html), "utf8");
        await execFileAsync(chromiumExecutable(), chromeArgs(inputPath, outputPath), {
          timeout: readPositiveInt(
            process.env.TRACE_DESIGN_PDF_RENDER_TIMEOUT_MS,
            DEFAULT_RENDER_TIMEOUT_MS,
          ),
          maxBuffer: 1024 * 1024,
        });
        const pdf = await fs.promises.readFile(outputPath);
        if (pdf.byteLength === 0) {
          throw new Error("Chromium produced an empty PDF");
        }
        return pdf;
      } finally {
        await fs.promises.rm(workdir, { recursive: true, force: true });
      }
    });
  },
};
