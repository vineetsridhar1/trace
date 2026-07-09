import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { TRACE_APP_STARTER_FILES } from "../dist/app-starter.js";

const execFileAsync = promisify(execFile);

async function run(command, args, cwd) {
  await execFileAsync(command, args, {
    cwd,
    env: {
      ...process.env,
      CI: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function writeStarterFiles(workdir) {
  for (const [filePath, contents] of Object.entries(TRACE_APP_STARTER_FILES)) {
    const absolutePath = path.join(workdir, filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, "utf8");
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited before ${url} was ready`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "no response"}`);
}

async function allocateSmokePort() {
  if (process.env.TRACE_APP_STARTER_SMOKE_PORT) return process.env.TRACE_APP_STARTER_SMOKE_PORT;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(String(address.port));
        } else {
          reject(new Error("Could not allocate a local smoke port"));
        }
      });
    });
  });
}

async function smokeRunStarter(workdir) {
  const port = await allocateSmokePort();
  const child = spawn("pnpm", ["dev", "--hostname", "127.0.0.1", "--port", port], {
    cwd: workdir,
    env: {
      ...process.env,
      CI: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    const rootUrl = `http://127.0.0.1:${port}/`;
    const rootResponse = await waitForHttp(rootUrl, child);
    const html = await rootResponse.text();
    if (!html.includes("Trace app session")) {
      throw new Error("Rendered app HTML is missing the starter marker");
    }
    if (!html.includes("Build the full-stack app from here.")) {
      throw new Error("Rendered app HTML is missing the starter headline");
    }

    const apiResponse = await fetch(`http://127.0.0.1:${port}/api/items`);
    if (!apiResponse.ok) {
      throw new Error(`Starter API returned HTTP ${apiResponse.status}`);
    }
    const payload = await apiResponse.json();
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error("Starter API did not return the seeded persistence item");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n\nDev server output:\n${output.slice(-8000)}`);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      wait(5_000).then(() => {
        child.kill("SIGKILL");
      }),
    ]);
  }
}

const keepWorkdir = process.env.TRACE_KEEP_APP_STARTER_SMOKE_DIR === "1";
const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "trace-app-starter-smoke-"));

try {
  await writeStarterFiles(workdir);
  await run("pnpm", ["install", "--ignore-scripts"], workdir);
  await run("pnpm", ["lint"], workdir);
  await run("pnpm", ["typecheck"], workdir);
  await run("pnpm", ["build"], workdir);
  await smokeRunStarter(workdir);
  console.log(`Trace app starter smoke passed in ${workdir}`);
} finally {
  if (!keepWorkdir) {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}
