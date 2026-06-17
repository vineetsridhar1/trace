import fs from "fs";
import { execFileSync } from "child_process";
import { ContainerBridge } from "./bridge.js";
import { loginAvailableTools } from "./tool-auth.js";
import { parseRuntimeSetupCommands, runRuntimeSetupCommands } from "./runtime-setup.js";

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

  fs.mkdirSync(sshDir, { mode: 0o700, recursive: true });

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

/**
 * If a per-user MCP config was injected (base64-encoded), decode it and merge
 * the mcpServers block into ~/.claude.json so Claude Code auto-loads the
 * connected MCP servers. The env var is cleared afterward so the bearer tokens
 * don't linger where child processes could read them.
 */
function setupMcpConfig(): void {
  const b64 = process.env.TRACE_MCP_CONFIG;
  if (!b64) return;

  let injected: { mcpServers?: Record<string, unknown> };
  try {
    injected = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch (err) {
    console.error("[container-bridge] failed to parse TRACE_MCP_CONFIG:", (err as Error).message);
    delete process.env.TRACE_MCP_CONFIG;
    return;
  }

  if (!injected.mcpServers || Object.keys(injected.mcpServers).length === 0) {
    delete process.env.TRACE_MCP_CONFIG;
    return;
  }

  const configPath = "/home/coder/.claude.json";
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    }
  } catch {
    existing = {};
  }

  const existingServers =
    existing.mcpServers && typeof existing.mcpServers === "object"
      ? (existing.mcpServers as Record<string, unknown>)
      : {};
  existing.mcpServers = { ...existingServers, ...injected.mcpServers };

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), { mode: 0o600 });

  delete process.env.TRACE_MCP_CONFIG;
  console.log("[container-bridge] MCP config written");
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
  const bridgeToken = requireEnv("TRACE_RUNTIME_TOKEN");
  const runtimeInstanceId = requireEnv("TRACE_RUNTIME_INSTANCE_ID");
  const tool = process.env.CODING_TOOL ?? process.env.TRACE_TOOL ?? "claude_code";

  // Set up SSH key before any git operations
  setupSshKey();

  // Write per-user MCP config so Claude Code picks up connected servers.
  setupMcpConfig();

  await runRuntimeSetupCommands(
    parseRuntimeSetupCommands(process.env.TRACE_RUNTIME_SETUP_COMMANDS),
  );

  // Pre-authenticate whatever tools we have credentials for.
  await loginAvailableTools();

  // Connect to server — sessions register dynamically via prepare commands
  const bridge = new ContainerBridge(bridgeUrl, bridgeToken, runtimeInstanceId, tool);
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
