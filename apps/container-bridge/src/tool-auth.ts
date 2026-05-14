import { execFile, spawn } from "child_process";

let codexLoginPromise: Promise<void> | null = null;
let codexLoggedIn = false;

const TOOL_ENV_VARS: Partial<Record<string, string>> = {
  claude_code: "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
};

function ensureBinaryAvailable(binary: string, tool: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(binary, ["--version"], { timeout: 2_000 }, (error) => {
      if (error) {
        reject(new Error(`Cannot run ${tool}: the \`${binary}\` binary was not found on PATH.`));
      } else {
        resolve();
      }
    });
    child.on("error", () => {
      reject(new Error(`Cannot run ${tool}: the \`${binary}\` binary was not found on PATH.`));
    });
  });
}

async function loginCodex(): Promise<void> {
  if (codexLoggedIn) return;
  if (!process.env.OPENAI_API_KEY) return;
  if (codexLoginPromise) return codexLoginPromise;

  console.log("[container-bridge] logging in to codex...");
  codexLoginPromise = new Promise<void>((resolve, reject) => {
    const child = spawn("sh", ["-c", 'echo "$OPENAI_API_KEY" | codex login --with-api-key'], {
      env: { ...process.env },
      stdio: ["inherit", "pipe", "pipe"],
    });

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
    await loginCodex();
  } else if (tool === "pi") {
    await ensureBinaryAvailable("pi", "pi");
  }
}

export async function loginAvailableTools(): Promise<void> {
  const tasks: Promise<void>[] = [];

  for (const [tool, envVar] of Object.entries(TOOL_ENV_VARS)) {
    if (!envVar || !process.env[envVar]) continue;
    tasks.push(ensureToolReady(tool));
  }

  await Promise.all(tasks);
}
