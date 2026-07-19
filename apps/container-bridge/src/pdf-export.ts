import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { execFile, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import type { BridgePdfExportCommand } from "@trace/shared";

const execFileAsync = promisify(execFile);
const PDF_SIGNATURE = Buffer.from("%PDF-");

type PdfExportInput = Pick<
  BridgePdfExportCommand,
  "commitSha" | "format" | "requestId" | "uploadTarget"
> & { workdir: string };

export async function exportPdfToTarget(input: PdfExportInput): Promise<void> {
  const exportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-pdf-export-"));
  const outputPath = path.join(exportDir, `${input.requestId}.pdf`);
  const worktree = path.join(exportDir, "repository");
  let previewProcess: ChildProcess | null = null;

  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: input.workdir,
    });
    const repoRoot = stdout.trim();
    const projectPath = path.relative(repoRoot, input.workdir);
    if (
      projectPath === ".." ||
      projectPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(projectPath)
    ) {
      throw new Error("PDF workspace is outside its repository");
    }

    await execFileAsync("git", ["rev-parse", "--verify", `${input.commitSha}^{commit}`], {
      cwd: repoRoot,
    });
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, input.commitSha], {
      cwd: repoRoot,
    });

    const projectRoot = path.join(worktree, projectPath);
    await linkInstalledDependencies(input.workdir, projectRoot);
    await fs.promises.writeFile(
      path.join(projectRoot, "document.format.json"),
      `${JSON.stringify(input.format, null, 2)}\n`,
    );
    await execFileAsync("pnpm", ["exec", "vite", "build"], {
      cwd: projectRoot,
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const previewPort = await reserveLocalPort();
    previewProcess = spawn(
      "pnpm",
      [
        "exec",
        "vite",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(previewPort),
        "--strictPort",
      ],
      {
        cwd: projectRoot,
        detached: process.platform !== "win32",
        stdio: "ignore",
      },
    );
    await waitForHttp(`http://127.0.0.1:${previewPort}`, previewProcess, 30_000);

    await execFileAsync(
      process.env.TRACE_CHROMIUM_EXECUTABLE?.trim() || "chromium",
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        `--user-data-dir=${path.join(exportDir, "profile")}`,
        "--print-to-pdf-no-header",
        `--print-to-pdf=${outputPath}`,
        `http://127.0.0.1:${previewPort}`,
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );

    const pdf = await fs.promises.readFile(outputPath);
    if (
      pdf.length <= PDF_SIGNATURE.length ||
      !pdf.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
    ) {
      throw new Error("Chromium did not produce a valid PDF");
    }
    await uploadPdf(pdf, input.uploadTarget);
  } finally {
    await stopProcess(previewProcess);
    await execFileAsync("git", ["worktree", "remove", "--force", worktree], {
      cwd: input.workdir,
    }).catch((error: unknown) => {
      console.warn("[pdf-export] failed to unregister temporary worktree", error);
    });
    await fs.promises.rm(exportDir, { recursive: true, force: true }).catch((error: unknown) => {
      console.warn("[pdf-export] failed to remove temporary export directory", error);
    });
  }
}

async function linkInstalledDependencies(workdir: string, projectRoot: string): Promise<void> {
  const source = path.join(workdir, "node_modules");
  const destination = path.join(projectRoot, "node_modules");
  if (fs.existsSync(source) && !fs.existsSync(destination)) {
    await fs.promises.symlink(source, destination, "junction");
  }
}

async function uploadPdf(
  pdf: Buffer,
  target: BridgePdfExportCommand["uploadTarget"],
): Promise<void> {
  const bytes = new Uint8Array(pdf);
  let response: Response;
  if (target.method === "PUT") {
    response = await fetch(target.url, {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      body: bytes,
    });
  } else {
    const body = new FormData();
    for (const [key, value] of Object.entries(target.fields)) body.append(key, value);
    body.append("file", new Blob([bytes], { type: "application/pdf" }), "document.pdf");
    response = await fetch(target.url, { method: "POST", body });
  }
  if (!response.ok) throw new Error(`PDF upload failed with status ${response.status}`);
}

async function reserveLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to reserve PDF preview port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForHttp(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`PDF preview exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting the PDF preview");
}

async function stopProcess(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  const pid = child.pid;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const signal = (name: NodeJS.Signals) => {
    try {
      if (process.platform === "win32") child.kill(name);
      else process.kill(-pid, name);
    } catch {
      // The process exited between the status check and signal.
    }
  };
  signal("SIGTERM");
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) {
    signal("SIGKILL");
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 1_000))]);
  }
}
