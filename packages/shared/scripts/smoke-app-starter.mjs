import { execFile } from "node:child_process";
import fs from "node:fs/promises";
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

const keepWorkdir = process.env.TRACE_KEEP_APP_STARTER_SMOKE_DIR === "1";
const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "trace-app-starter-smoke-"));

try {
  await writeStarterFiles(workdir);
  await run("pnpm", ["install", "--ignore-scripts"], workdir);
  await run("pnpm", ["lint"], workdir);
  await run("pnpm", ["typecheck"], workdir);
  await run("pnpm", ["build"], workdir);
  console.log(`Trace app starter smoke passed in ${workdir}`);
} finally {
  if (!keepWorkdir) {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}
