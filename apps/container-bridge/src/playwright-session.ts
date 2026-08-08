import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT_ROOT = "/tmp/trace-playwright";
const DEFAULT_CONFIG_PATH = "/opt/trace/playwright-cli.config.json";

export type PlaywrightInvocationSession = {
  invocationId: string;
  sessionName: string;
  outputDir: string;
  env: Record<string, string>;
};

type CleanupDependencies = {
  run?: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<unknown>;
  remove?: (target: string) => Promise<void>;
};

export async function createPlaywrightInvocationSession(input: {
  invocationId: string;
  outputRoot?: string;
  configPath?: string;
}): Promise<PlaywrightInvocationSession> {
  if (!input.invocationId.trim()) throw new Error("Trace invocation ID is required");

  const key = randomBytes(16).toString("hex");
  const outputDir = join(input.outputRoot ?? DEFAULT_OUTPUT_ROOT, key);
  await mkdir(outputDir, { recursive: true, mode: 0o700 });

  return {
    invocationId: input.invocationId,
    sessionName: `trace-${key}`,
    outputDir,
    env: {
      PLAYWRIGHT_BROWSERS_PATH: "/opt/ms-playwright",
      PLAYWRIGHT_CLI_CONFIG: input.configPath ?? DEFAULT_CONFIG_PATH,
      PLAYWRIGHT_CLI_SESSION: `trace-${key}`,
      PLAYWRIGHT_MCP_EXECUTABLE_PATH: "/usr/bin/chromium",
      PLAYWRIGHT_MCP_HEADLESS: "true",
      PLAYWRIGHT_MCP_ISOLATED: "true",
      PLAYWRIGHT_MCP_OUTPUT_DIR: outputDir,
      PLAYWRIGHT_MCP_TIMEOUT_ACTION: "10000",
      PLAYWRIGHT_MCP_TIMEOUT_NAVIGATION: "60000",
      PLAYWRIGHT_MCP_VIEWPORT_SIZE: "1440x900",
      TRACE_BROWSER_VIDEO_DIR: outputDir,
      TRACE_BROWSER_VIDEO_VALIDATE: "/usr/local/bin/trace-browser-video-validate",
    },
  };
}

export async function cleanupPlaywrightInvocationSession(
  session: PlaywrightInvocationSession,
  dependencies: CleanupDependencies = {},
): Promise<void> {
  const run =
    dependencies.run ??
    ((command: string, args: string[], env: NodeJS.ProcessEnv) =>
      execFileAsync(command, args, { env, timeout: 10_000 }));
  const env = { ...process.env, ...session.env };

  for (const command of ["close", "delete-data"]) {
    try {
      await run("playwright-cli", [command], env);
    } catch {
      // Cleanup must remain best-effort when the daemon or CLI already exited.
    }
  }

  const remove =
    dependencies.remove ??
    ((target: string) => rm(target, { recursive: true, force: true }).then(() => undefined));
  try {
    await remove(session.outputDir);
  } catch {
    // A failed temp-directory removal must not create an unhandled rejection on abort.
  }
}
