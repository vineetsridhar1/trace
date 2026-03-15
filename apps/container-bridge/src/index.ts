import { ContainerBridge } from "./bridge.js";
import { cloneRepo } from "./workspace.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[container-bridge] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const WORKDIR = `/workspace`;

async function main(): Promise<void> {
  const bridgeUrl = requireEnv("TRACE_BRIDGE_URL");
  const sessionId = requireEnv("SESSION_ID");
  const bridgeToken = requireEnv("BRIDGE_TOKEN");
  const tool = process.env.CODING_TOOL ?? "claude_code";
  const model = process.env.MODEL;
  const repoRemoteUrl = process.env.REPO_REMOTE_URL;
  const repoDefaultBranch = process.env.REPO_DEFAULT_BRANCH ?? "main";
  const branch = process.env.BRANCH;

  const bridge = new ContainerBridge(bridgeUrl, sessionId, bridgeToken, tool, model);

  // Connect to server first so we can send status messages
  bridge.connect();

  // Clone repo if configured
  if (repoRemoteUrl) {
    try {
      console.log(`[container-bridge] cloning ${repoRemoteUrl} into ${WORKDIR}...`);
      const { workdir } = await cloneRepo({
        remoteUrl: repoRemoteUrl,
        defaultBranch: repoDefaultBranch,
        branch,
        targetDir: WORKDIR,
      });
      console.log(`[container-bridge] workspace ready at ${workdir}`);
      bridge.sendWorkspaceReady(workdir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[container-bridge] workspace failed:`, message);
      bridge.sendWorkspaceFailed(message);
    }
  }

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
