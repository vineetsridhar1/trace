import { spawn } from "child_process";

let codexLoginPromise: Promise<void> | null = null;
let codexLoggedIn = false;

const TOOL_ENV_VARS: Partial<Record<string, string>> = {
  claude_code: "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
};

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
      if (outLines.length) console.log("[container-bridge] codex login stdout:", outLines.join("\n"));
      if (errLines.length) console.log("[container-bridge] codex login stderr:", errLines.join("\n"));
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
  if (tool === "codex") {
    await loginCodex();
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
