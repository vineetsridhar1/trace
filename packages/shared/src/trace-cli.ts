import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TRACE_CLI_SOURCE } from "./trace-cli.generated.js";
import { materializeTraceVisualPlanSkillAt } from "./visual-plan-skill.js";

export interface TracePlanRuntime {
  cliPath: string;
  env: Record<string, string>;
  rootDir: string;
  skillPath: string;
}

export function traceApiUrlFromBridgeUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function materializeTracePlanRuntime(input: {
  sessionId: string;
  runId: string;
  runToken: string;
  serverUrl: string;
  inheritedPath?: string;
}): TracePlanRuntime {
  const rootDir = path.join(os.tmpdir(), "trace-runs", input.sessionId, input.runId);
  const binDir = path.join(rootDir, "bin");
  const cliPath = path.join(binDir, "trace");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(cliPath, TRACE_CLI_SOURCE, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(cliPath, 0o755);

  const skillPath = materializeTraceVisualPlanSkillAt(path.join(rootDir, "skills", "visual-plan"));
  return {
    cliPath,
    rootDir,
    skillPath,
    env: {
      PATH: `${binDir}${path.delimiter}${input.inheritedPath ?? process.env.PATH ?? ""}`,
      TRACE_API_URL: traceApiUrlFromBridgeUrl(input.serverUrl),
      TRACE_RUN_ID: input.runId,
      TRACE_RUN_TOKEN: input.runToken,
      TRACE_SESSION_ID: input.sessionId,
    },
  };
}

export function buildTraceVisualPlanInstruction(skillPath: string): string {
  return `<system-instruction>
This is a Trace plan-mode run. You MUST read and follow the complete visual-plan
skill at ${skillPath} before drafting. Its Trace Runtime Transport section is
the authoritative publishing workflow for this run and overrides provider-native
plan modes, hosted Agent-Native tools, and fixed plan.mdx paths.

Author the plan in any local MDX file you choose. Upload renderable drafts with
\`trace output push --type visual-plan --file <path> --draft\` so Trace can update
the live review panel. When the complete standalone plan validates, run
\`trace output push --type visual-plan --file <path> --final\` exactly once, then
finish without pasting the plan into chat. The Trace CLI is already installed
and authenticated for this run.
</system-instruction>`;
}
