#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { deviceFlowLogin, saveToken } from "./auth.js";
import { TraceClient } from "./trace-client.js";
import { registerObserveTools } from "./tools/observe.js";
import { registerDriveTools } from "./tools/drive.js";

/** `trace-mcp login` — run the GitHub device flow and persist the token. */
async function runLogin(): Promise<void> {
  const config = loadConfig();
  const log = (msg: string) => process.stderr.write(`${msg}\n`);
  log(`Logging in to ${config.baseUrl}…`);
  const token = await deviceFlowLogin(config.baseUrl, log);
  await saveToken(config.credentialsPath, config.baseUrl, token);
  log(`\n✓ Logged in. Token saved to ${config.credentialsPath}`);
}

async function runServer(): Promise<void> {
  const config = loadConfig();
  const client = new TraceClient(config);

  const server = new McpServer({ name: "trace-mcp", version: "0.1.0" });
  registerObserveTools(server, client);
  registerDriveTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdio transport owns stdout for protocol traffic; log to stderr only.
  console.error(`trace-mcp connected to ${config.baseUrl}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "login") {
    await runLogin();
    return;
  }
  await runServer();
}

main().catch((err) => {
  console.error("trace-mcp error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
