export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Format a value as a pretty-printed JSON text result. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** Format an error (or message) as an MCP error result. */
export function errorResult(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * Run a tool handler body, converting any thrown error into an MCP error
 * result. Lets each handler focus on its query and skip the try/catch.
 */
export async function run(body: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await body();
  } catch (err) {
    return errorResult(err);
  }
}

/** Coding tools Trace can run a session with (shared by the tool schemas). */
export const CODING_TOOLS = ["antigravity", "claude_code", "codex", "custom", "pi"] as const;

/** Core session fields shared between the observe and drive tool results. */
export const SESSION_CORE_FIELDS = `
  id
  name
  agentStatus
  sessionStatus
  tool
  model
  hosting
  branch
  sessionGroupId
  createdAt
`;
