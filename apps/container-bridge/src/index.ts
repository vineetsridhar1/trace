import fs from "fs";
import { execFileSync } from "child_process";
import { ContainerBridge } from "./bridge.js";
import { loginAvailableTools } from "./tool-auth.js";

/**
 * If an SSH private key was injected (base64-encoded), decode it to ~/.ssh/id_rsa
 * and populate known_hosts so git clone over SSH works without prompts.
 */
function setupSshKey(): void {
  const b64Key = process.env.SSH_PRIVATE_KEY;
  if (!b64Key) return;

  const sshDir = "/home/coder/.ssh";
  const keyPath = `${sshDir}/id_rsa`;
  const knownHostsPath = `${sshDir}/known_hosts`;

  // Decode base64 key and write with correct permissions
  const keyContent = Buffer.from(b64Key, "base64").toString("utf8");
  fs.writeFileSync(keyPath, keyContent, { mode: 0o600 });

  // Add github.com host key to known_hosts to avoid interactive prompt
  try {
    const hostKeys = execFileSync("ssh-keyscan", ["-t", "ed25519,rsa", "github.com"], {
      timeout: 10_000,
    });
    fs.writeFileSync(knownHostsPath, hostKeys, { mode: 0o644 });
  } catch {
    // Fallback: GitHub's published SSH host key
    fs.writeFileSync(
      knownHostsPath,
      "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n",
      { mode: 0o644 },
    );
  }

  // Clear the env var — the key is on disk where SSH needs it,
  // no reason to keep it in memory where child processes could leak it.
  delete process.env.SSH_PRIVATE_KEY;

  console.log("[container-bridge] SSH key configured");
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

  // Log which credentials are present (not values) to aid debugging.
  console.log("[container-bridge] env check: ANTHROPIC_API_KEY=" + (process.env.ANTHROPIC_API_KEY ? "set" : "not set"));
  console.log("[container-bridge] env check: OPENAI_API_KEY=" + (process.env.OPENAI_API_KEY ? "set" : "not set"));
  console.log("[container-bridge] env check: GITHUB_TOKEN=" + (process.env.GITHUB_TOKEN ? "set" : "not set"));
  console.log("[container-bridge] env check: SSH_PRIVATE_KEY=" + (process.env.SSH_PRIVATE_KEY ? "set" : "not set"));

  // Set up SSH key before any git operations
  setupSshKey();

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
