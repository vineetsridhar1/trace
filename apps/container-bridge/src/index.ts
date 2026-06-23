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

type InjectedMcpServer = {
  type?: unknown;
  url?: unknown;
  headers?: unknown;
};

type InjectedMcpConfig = {
  mcpServers?: Record<string, InjectedMcpServer>;
};

function authTokenFromHeaders(headers: unknown): string | null {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return null;
  const authorization = (headers as Record<string, unknown>).Authorization;
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function codexTokenEnvName(serverName: string): string {
  const suffix = serverName
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `TRACE_MCP_TOKEN_${suffix || "SERVER"}`;
}

function writeClaudeMcpConfig(mcpServers: Record<string, InjectedMcpServer>): boolean {
  const configPath = "/home/coder/.claude.json";
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch (err) {
      // Don't clobber an existing (if malformed) config we can't safely merge.
      console.error(
        "[container-bridge] existing .claude.json is not valid JSON; skipping MCP config:",
        (err as Error).message,
      );
      return false;
    }
  }

  const existingServers =
    existing.mcpServers && typeof existing.mcpServers === "object"
      ? (existing.mcpServers as Record<string, unknown>)
      : {};
  existing.mcpServers = { ...existingServers, ...mcpServers };

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), { mode: 0o600 });
  return true;
}

function writeCodexMcpConfig(mcpServers: Record<string, InjectedMcpServer>): boolean {
  let configuredCount = 0;

  for (const [name, server] of Object.entries(mcpServers)) {
    if (typeof server.url !== "string") {
      console.error(`[container-bridge] skipping MCP server ${name}: missing URL`);
      continue;
    }

    const token = authTokenFromHeaders(server.headers);
    const args = ["mcp", "add", name, "--url", server.url];
    if (token) {
      const tokenEnvName = codexTokenEnvName(name);
      process.env[tokenEnvName] = token;
      args.push("--bearer-token-env-var", tokenEnvName);
    }

    try {
      execFileSync("codex", ["mcp", "remove", name], { stdio: "ignore" });
    } catch {
      // The server may not exist yet. Add below is authoritative.
    }

    try {
      execFileSync("codex", args, { stdio: "ignore" });
      configuredCount += 1;
    } catch (err) {
      console.error(
        `[container-bridge] failed to write Codex MCP server ${name}:`,
        (err as Error).message,
      );
    }
  }

  return configuredCount > 0;
}

/**
 * If a per-user MCP config was injected (base64-encoded), decode it and write
 * the tool-specific config file so the selected coding tool auto-loads the
 * connected MCP servers. The transport env var is cleared afterward; Codex
 * keeps per-server token env vars because its config references them directly.
 */
function setupMcpConfig(tool: string): void {
  const b64 = process.env.TRACE_MCP_CONFIG;
  if (!b64) return;

  let injected: InjectedMcpConfig;
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

  const wroteConfig =
    tool === "codex"
      ? writeCodexMcpConfig(injected.mcpServers)
      : writeClaudeMcpConfig(injected.mcpServers);

  delete process.env.TRACE_MCP_CONFIG;
  if (wroteConfig) console.log(`[container-bridge] MCP config written for ${tool}`);
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

  // Write per-user MCP config so the selected tool picks up connected servers.
  setupMcpConfig(tool);

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
