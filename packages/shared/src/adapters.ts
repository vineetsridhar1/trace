// Node-only entrypoint — re-exports adapter implementations that depend on child_process.
// Browser code should import from "@trace/shared" (the main entrypoint) instead.
export { ClaudeCodeAdapter } from "./adapters/claude-code.js";
export { CodexAdapter } from "./adapters/codex.js";
