import fs from "fs";
import { execFileSync } from "child_process";
import { ContainerBridge } from "./bridge.js";
import { installCodexAuthFile, loginAvailableTools } from "./tool-auth.js";
import { parseRuntimeSetupCommands, runRuntimeSetupCommands } from "./runtime-setup.js";
import { RuntimeLeaseWatchdog, type RuntimeLeaseExpirationReason } from "./runtime-lease.js";

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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[container-bridge] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalPositiveIntegerEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Math.floor(value);
}

async function main(): Promise<void> {
  const bridgeUrl = requireEnv("TRACE_BRIDGE_URL");
  const bridgeToken = requireEnv("TRACE_RUNTIME_TOKEN");
  const runtimeInstanceId = requireEnv("TRACE_RUNTIME_INSTANCE_ID");
  const leaseRequired = process.env.TRACE_RUNTIME_LEASE_REQUIRED === "true";
  const leaseTtlMs = optionalPositiveIntegerEnv("TRACE_RUNTIME_LEASE_TTL_MS");
  const hardDeadlineTtlMs = optionalPositiveIntegerEnv("TRACE_RUNTIME_HARD_DEADLINE_TTL_MS");
  const tool = process.env.CODING_TOOL ?? process.env.TRACE_TOOL ?? "claude_code";

  // Arm the fail-safe before setup, authentication, or bridge connection.
  // A hung bootstrap command must not bypass the same lifetime boundary that
  // protects an already-connected runtime.
  let bridge: ContainerBridge | null = null;
  if (leaseRequired && (!leaseTtlMs || !hardDeadlineTtlMs)) {
    throw new Error(
      "runtime lease enforcement is required but TRACE_RUNTIME_LEASE_TTL_MS or TRACE_RUNTIME_HARD_DEADLINE_TTL_MS is missing",
    );
  }
  const leaseWatchdog =
    leaseTtlMs && hardDeadlineTtlMs
      ? new RuntimeLeaseWatchdog({
          leaseTtlMs,
          hardDeadlineTtlMs,
          onHardDeadlineApproaching: (remainingMs) => {
            console.warn(
              JSON.stringify({
                event: "runtime_hard_deadline_approaching",
                runtimeInstanceId,
                remainingMs,
              }),
            );
          },
          onExpired: (reason: RuntimeLeaseExpirationReason) => {
            console.error(
              JSON.stringify({
                event: "runtime_lease_expired",
                runtimeInstanceId,
                reason,
              }),
            );
            if (!bridge) {
              process.exit(0);
              return;
            }
            void bridge.shutdown().finally(() => process.exit(0));
          },
        })
      : null;
  if (leaseWatchdog) {
    leaseWatchdog.start();
  } else {
    console.warn(
      "[container-bridge] runtime lease enforcement disabled for legacy launch compatibility",
    );
  }

  // Set up SSH key before any git operations
  setupSshKey();
  installCodexAuthFile();

  await runRuntimeSetupCommands(
    parseRuntimeSetupCommands(process.env.TRACE_RUNTIME_SETUP_COMMANDS),
  );

  // Pre-authenticate whatever tools we have credentials for.
  await loginAvailableTools();

  // Connect to server — sessions register dynamically via prepare commands
  bridge = new ContainerBridge(
    bridgeUrl,
    bridgeToken,
    runtimeInstanceId,
    tool,
    leaseWatchdog !== null,
    (ttlMs) => {
      if (!leaseWatchdog?.renew(ttlMs)) {
        console.warn("[container-bridge] ignored invalid runtime lease renewal");
      }
    },
  );
  bridge.connect();

  // Keep the process alive
  process.on("SIGTERM", () => {
    console.log("[container-bridge] received SIGTERM, shutting down");
    leaseWatchdog?.stop();
    void bridge.shutdown().finally(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    console.log("[container-bridge] received SIGINT, shutting down");
    leaseWatchdog?.stop();
    void bridge.shutdown().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("[container-bridge] fatal error:", err);
  process.exit(1);
});
