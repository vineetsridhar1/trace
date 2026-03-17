import { ContainerBridge } from "./bridge.js";
import { loginAvailableTools } from "./tool-auth.js";

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

  // Pre-authenticate whatever tools we have credentials for.
  await loginAvailableTools();

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
