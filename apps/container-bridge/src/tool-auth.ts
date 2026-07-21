import { execFile, spawn } from "child_process";
import { buildChildProcessEnv } from "@trace/shared/adapters";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

let codexLoginPromise: Promise<void> | null = null;
let codexLoggedIn = false;

const TOOL_ENV_VARS: Partial<Record<string, string>> = {
  claude_code: "ANTHROPIC_API_KEY",
};

const CODEX_HOME = process.env.CODEX_HOME ?? "/home/coder/.codex";

export function installCodexAuthFile(authJson = process.env.CODEX_AUTH_JSON): boolean {
  if (!authJson) return false;
  try {
    JSON.parse(authJson) as unknown;
  } catch {
    throw new Error("Codex session credential is not valid JSON.");
  }
  mkdirSync(CODEX_HOME, { mode: 0o700, recursive: true });
  writeFileSync(`${CODEX_HOME}/config.toml`, 'cli_auth_credentials_store = "file"\n', {
    mode: 0o600,
  });
  writeFileSync(`${CODEX_HOME}/auth.json`, authJson, { mode: 0o600 });
  delete process.env.CODEX_AUTH_JSON;
  return true;
}

export async function syncCodexAuthFile(): Promise<void> {
  const serverUrl = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  const runtimeToken = process.env.TRACE_RUNTIME_TOKEN;
  const authPath = `${CODEX_HOME}/auth.json`;
  if (!serverUrl || !runtimeToken || !existsSync(authPath)) return;

  const authJson = readFileSync(authPath, "utf8");
  const response = await fetch(new URL("/runtime/codex-auth", serverUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authJson }),
  });
  if (!response.ok) throw new Error(`Codex session credential sync failed (${response.status}).`);
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
  const accessToken = process.env.CODEX_ACCESS_TOKEN;
  const apiKey = process.env.CODEX_API_KEY;
  const method = process.env.CODEX_AUTH_METHOD;
  if (method !== "access_token" && method !== "api_key") return;
  if (codexLoginPromise) return codexLoginPromise;

  console.log("[container-bridge] logging in to codex...");
  codexLoginPromise = new Promise<void>((resolve, reject) => {
    const credential = method === "access_token" ? accessToken : apiKey;
    if (!credential) throw new Error(`Codex ${method} credential is unavailable`);
    const loginArgument = method === "access_token" ? "--with-access-token" : "--with-api-key";
    const child = spawn("codex", ["login", loginArgument], {
      env: buildChildProcessEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(credential);

    const outLines: string[] = [];
    const errLines: string[] = [];
    child.stdout?.on("data", (d: Buffer) => outLines.push(d.toString().trim()));
    child.stderr?.on("data", (d: Buffer) => errLines.push(d.toString().trim()));

    child.on("close", (code) => {
      if (outLines.length)
        console.log("[container-bridge] codex login stdout:", outLines.join("\n"));
      if (errLines.length)
        console.log("[container-bridge] codex login stderr:", errLines.join("\n"));
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
  // Fail fast with a clear message if the required API key is missing
  const requiredEnv = TOOL_ENV_VARS[tool];
  if (requiredEnv && !process.env[requiredEnv]) {
    throw new Error(
      `Cannot run ${tool}: ${requiredEnv} is not set. Add your API key in Settings → API Tokens.`,
    );
  }

  if (tool === "codex") {
    const method = process.env.CODEX_AUTH_METHOD;
    if (!method) {
      throw new Error(
        "Cannot run codex: add a ChatGPT session, Codex access token, or OpenAI API key in Settings → API Tokens.",
      );
    }
    if (method === "chatgpt_session" && !existsSync(`${CODEX_HOME}/auth.json`)) {
      throw new Error("Codex ChatGPT session credential is unavailable.");
    }
    if (method === "access_token" || method === "api_key") await loginCodex();
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
    if (!envVar || !process.env[envVar]) continue;
    tasks.push(ensureToolReady(tool));
  }

  if (process.env.CODEX_AUTH_METHOD) {
    tasks.push(ensureToolReady("codex"));
  }

  await Promise.all(tasks);
}
