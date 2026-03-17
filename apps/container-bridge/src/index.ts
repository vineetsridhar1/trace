import { spawn } from "child_process";
import { ContainerBridge } from "./bridge.js";

/** Pre-authenticate coding tool CLIs using env vars. */
async function loginTools(tool: string): Promise<void> {
  if (tool === "codex" && process.env.OPENAI_API_KEY) {
    console.log("[container-bridge] logging in to codex...");
    await new Promise<void>((resolve, reject) => {
      const child = spawn("sh", ["-c", 'echo "$OPENAI_API_KEY" | codex login --with-api-key'], {
        env: { ...process.env },
        stdio: ["inherit", "pipe", "pipe"],
      });
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`codex login exited ${code}`)));
      child.on("error", reject);
    });
    console.log("[container-bridge] codex login complete");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[container-bridge] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const bridgeUrl = requireEnv("TRACE_BRIDGE_URL");
  const bridgeToken = requireEnv("BRIDGE_TOKEN");
  const machineId = requireEnv("CLOUD_MACHINE_ID");
  const tool = process.env.CODING_TOOL ?? "claude_code";

  // Pre-authenticate tool CLIs before starting
  await loginTools(tool);

  // Connect to server — sessions register dynamically via prepare commands
  const bridge = new ContainerBridge(bridgeUrl, bridgeToken, machineId, tool);
  bridge.connect();

  // Keep the process alive
  process.on("SIGTERM", () => {
    console.log("[container-bridge] received SIGTERM, shutting down");
    bridge.disconnect();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("[container-bridge] received SIGINT, shutting down");
    bridge.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[container-bridge] fatal error:", err);
  process.exit(1);
});
