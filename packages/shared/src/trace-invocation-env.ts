import { delimiter, join } from "path";

export function buildTraceInvocationEnv(input: {
  runtimeEnv?: Record<string, string>;
  serverUrl: string;
  skillsDir: string;
  binDir: string;
  nodeBinary: string;
  basePath?: string;
  electronRunAsNode?: boolean;
}): Record<string, string> {
  const traceApiUrl = new URL(input.serverUrl);
  if (traceApiUrl.protocol === "wss:") traceApiUrl.protocol = "https:";
  if (traceApiUrl.protocol === "ws:") traceApiUrl.protocol = "http:";
  traceApiUrl.pathname = "/";
  traceApiUrl.search = "";
  traceApiUrl.hash = "";

  return {
    ...input.runtimeEnv,
    TRACE_API_URL: traceApiUrl.toString(),
    // Keep both legacy and current names pinned to the bridge's control plane.
    // A runtime credential is only valid on the server that minted it; retaining
    // a service-supplied fallback here can send agents to a different deployment.
    TRACE_SERVER_URL: traceApiUrl.toString(),
    TRACE_CLI: join(input.binDir, "trace"),
    TRACE_SKILLS_DIR: input.skillsDir,
    TRACE_NODE_BINARY: input.nodeBinary,
    ...(input.electronRunAsNode ? { TRACE_ELECTRON_RUN_AS_NODE: "1" } : {}),
    PATH: `${input.binDir}${delimiter}${input.basePath ?? ""}`,
  };
}
