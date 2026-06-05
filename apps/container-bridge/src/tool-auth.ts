import { execFile, spawn } from "child_process";
import { buildChildProcessEnv } from "@trace/shared/adapters";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

let codexLoginPromise: Promise<void> | null = null;
let codexLoggedIn = false;

const TOOL_ENV_VARS: Partial<Record<string, string | string[]>> = {
  claude_code: "ANTHROPIC_API_KEY",
  codex: ["CODEX_ACCESS_TOKEN", "OPENAI_API_KEY"],
};

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function ensureBinaryAvailable(binary: string, tool: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      ["--version"],
      { env: buildChildProcessEnv(), timeout: 2_000 },
      (error) => {
        if (error) {
          reject(new Error(`Cannot run ${tool}: the \`${binary}\` binary was not found on PATH.`));
        } else {
          resolve();
        }
      },
    );
    child.on("error", () => {
      reject(new Error(`Cannot run ${tool}: the \`${binary}\` binary was not found on PATH.`));
    });
  });
}

async function loginCodex(): Promise<void> {
  if (codexLoggedIn) return;
  const accessToken = nonEmptyEnv("CODEX_ACCESS_TOKEN");
  const apiKey = nonEmptyEnv("OPENAI_API_KEY");
  const token = accessToken || apiKey;
  if (!token) return;
  if (codexLoginPromise) return codexLoginPromise;

  console.log("[container-bridge] logging in to codex...");
  codexLoginPromise = new Promise<void>((resolve, reject) => {
    const loginFlag = accessToken ? "--with-access-token" : "--with-api-key";
    const child = spawn("codex", ["login", loginFlag], {
      env: buildChildProcessEnv(),
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(token);

    child.on("close", (code) => {
      if (code === 0) {
        codexLoggedIn = true;
        console.log("[container-bridge] codex login complete");
        resolve();
      } else {
        reject(new Error(`codex login exited ${code}`));
      }
    });
    child.on("error", reject);
  }).finally(() => {
    if (!codexLoggedIn) {
      codexLoginPromise = null;
    }
  });

  return codexLoginPromise;
}

export async function ensureToolReady(tool: string): Promise<void> {
  // Fail fast with a clear message if the required credential is missing.
  const requiredEnv = TOOL_ENV_VARS[tool];
  const requiredEnvs = Array.isArray(requiredEnv) ? requiredEnv : requiredEnv ? [requiredEnv] : [];
  if (requiredEnvs.length > 0 && !requiredEnvs.some((envVar) => nonEmptyEnv(envVar))) {
    if (tool === "codex") {
      throw new Error(
        "Cannot run codex: Connect a Codex access token in Settings or provide OPENAI_API_KEY in the runtime environment.",
      );
    }
    throw new Error(
      `Cannot run ${tool}: ${requiredEnvs[0]} is not set. Add your API key in Settings → API Tokens.`,
    );
  }

  if (tool === "codex") {
    await loginCodex();
  } else if (tool === "pi") {
    await ensureBinaryAvailable("pi", "pi");
  } else if (tool === "antigravity") {
    await ensureAntigravityReady();
  }
}

/**
 * Antigravity (`agy`) authenticates via the user's logged-in Google account
 * (OAuth creds on disk) or an API key — there's no separate login step to run.
 * Soft gate: confirm the binary is present and that *some* credential exists,
 * rather than hard-requiring a specific env var (which would block OAuth).
 */
async function ensureAntigravityReady(): Promise<void> {
  await ensureBinaryAvailable("agy", "antigravity");
  const hasApiKey = Boolean(process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_API_KEY);
  const hasOAuthCreds = existsSync(join(homedir(), ".gemini", "oauth_creds.json"));
  if (!hasApiKey && !hasOAuthCreds) {
    throw new Error(
      "Cannot run antigravity: not authenticated. Set GEMINI_API_KEY or sign in with `agy` using your Google account.",
    );
  }
}

export async function loginAvailableTools(): Promise<void> {
  const tasks: Promise<void>[] = [];

  for (const [tool, envVar] of Object.entries(TOOL_ENV_VARS)) {
    const envVars = Array.isArray(envVar) ? envVar : envVar ? [envVar] : [];
    if (!envVars.some((name) => nonEmptyEnv(name))) continue;
    tasks.push(ensureToolReady(tool));
  }

  await Promise.all(tasks);
}
