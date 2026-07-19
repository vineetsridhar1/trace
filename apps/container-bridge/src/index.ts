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

function writeFileWithPrivateMode(path: string, content: string): void {
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { mode: 0o700, recursive: true });
  fs.writeFileSync(path, content, { mode: 0o600 });
}

/**
 * Configure the installed coding clients to call the server-hosted MCP. The
 * token stays in the bridge environment so Codex can read it from its declared
 * env var; app processes do not inherit *_TOKEN variables (see childEnv).
 */
function setupAgentMcp(): void {
  const token = process.env.TRACE_AGENT_MCP_TOKEN;
  const serverUrl = process.env.TRACE_SERVER_PUBLIC_URL?.replace(/\/+$/, "");
  if (!token || !serverUrl) return;

  const mcpUrl = `${serverUrl}/mcp`;
  const claudePath = "/home/coder/.claude.json";
  let claudeConfig: Record<string, unknown> = {};
  try {
    if (fs.existsSync(claudePath)) {
      claudeConfig = JSON.parse(fs.readFileSync(claudePath, "utf8")) as Record<string, unknown>;
    }
  } catch {
    // A malformed optional user config must not prevent the runtime starting.
  }
  const mcpServers =
    claudeConfig.mcpServers && typeof claudeConfig.mcpServers === "object"
      ? (claudeConfig.mcpServers as Record<string, unknown>)
      : {};
  claudeConfig.mcpServers = {
    ...mcpServers,
    trace: { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
  };
  writeFileWithPrivateMode(claudePath, `${JSON.stringify(claudeConfig, null, 2)}\n`);

  const tomlString = (value: string) => JSON.stringify(value);
  writeFileWithPrivateMode(
    "/home/coder/.codex/config.toml",
    `[mcp_servers.trace]\nurl = ${tomlString(mcpUrl)}\nbearer_token_env_var = "TRACE_AGENT_MCP_TOKEN"\n`,
  );
  console.log("[container-bridge] agent MCP configured");
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
  setupAgentMcp();

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
