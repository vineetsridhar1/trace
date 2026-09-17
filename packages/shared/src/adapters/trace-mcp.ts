export function traceMcpUrl(runtimeEnv: Record<string, string> | undefined): string | null {
  if (!runtimeEnv?.TRACE_INVOCATION_TOKEN) return null;
  const serverUrl = runtimeEnv.TRACE_SERVER_URL?.trim();
  if (!serverUrl) return null;
  return `${serverUrl.replace(/\/$/, "")}/agent/mcp`;
}

export function claudeTraceMcpConfig(url: string): string {
  return JSON.stringify({
    mcpServers: {
      trace: {
        type: "http",
        url,
        headers: { Authorization: "Bearer ${TRACE_INVOCATION_TOKEN}" },
      },
    },
  });
}
