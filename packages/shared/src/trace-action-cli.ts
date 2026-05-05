import fs from "fs";
import path from "path";
import type { BridgeTraceActionContext } from "./bridge.js";
import type { ToolOutput } from "./adapters/coding-tool.js";

const TRACE_ACTION_CLI_DIR = ".trace";

export async function writeTraceActionCli(
  workdir: string,
  action: BridgeTraceActionContext,
  serverUrlOverride?: string,
): Promise<string> {
  if (action.type !== "project_ticket_generation") {
    throw new Error(`Unsupported Trace action type: ${action.type}`);
  }

  const relativePath = action.cliRelativePath || ".trace/trace-project-ticket.mjs";
  const cliPath = path.resolve(workdir, relativePath);
  const expectedRoot = path.resolve(workdir, TRACE_ACTION_CLI_DIR);
  if (!cliPath.startsWith(expectedRoot + path.sep)) {
    throw new Error("Trace action CLI path must live under .trace/");
  }

  await fs.promises.mkdir(path.dirname(cliPath), { recursive: true });
  const serverUrl = (serverUrlOverride ?? action.serverUrl).replace(/\/+$/, "");
  const script = `#!/usr/bin/env node
const SERVER_URL = ${JSON.stringify(serverUrl)};
const TOKEN = ${JSON.stringify(action.token)};

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(label + " must be valid JSON: " + error.message);
  }
}

async function request(path, body) {
  const response = await fetch(SERVER_URL + path, {
    method: "POST",
    headers: {
      "authorization": "Bearer " + TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  const data = text ? parseJson(text, "Response") : {};
  if (!response.ok) {
    throw new Error(data.error || data.message || ("Trace request failed with " + response.status));
  }
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const [command, jsonArg] = process.argv.slice(2);
  if (command === "create") {
    const raw = jsonArg ?? await readStdin();
    if (!raw) throw new Error("create requires a ticket JSON object via argv or stdin");
    await request("/session-actions/project-ticket-generation/ticket", parseJson(raw, "Ticket"));
    return;
  }
  if (command === "complete") {
    await request("/session-actions/project-ticket-generation/complete", {});
    return;
  }
  if (command === "fail") {
    const raw = jsonArg ?? await readStdin();
    const body = raw ? parseJson(raw, "Failure") : {};
    await request("/session-actions/project-ticket-generation/fail", body);
    return;
  }
  console.error("Usage:");
  console.error("  node ${relativePath} create '{\\"title\\":\\"...\\",\\"description\\":\\"...\\"}'");
  console.error("  node ${relativePath} complete");
  console.error("  node ${relativePath} fail '{\\"error\\":\\"...\\"}'");
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
  await fs.promises.writeFile(cliPath, script, { mode: 0o700 });
  await fs.promises.chmod(cliPath, 0o700);
  return relativePath;
}

export function traceActionStartedOutput(action: BridgeTraceActionContext): ToolOutput {
  return {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          name: "TraceTicketGenerationStart",
          input: {
            projectRunId: action.projectRunId,
            generationAttemptId: action.generationAttemptId,
            cliRelativePath: action.cliRelativePath,
          },
        },
      ],
    },
  };
}
