// Node-only entrypoint — re-exports adapter implementations that depend on child_process.
// Browser code should import from "@trace/shared" (the main entrypoint) instead.
export { AntigravityAdapter } from "./adapters/antigravity.js";
export { ClaudeCodeAdapter } from "./adapters/claude-code.js";
export { CodexAdapter } from "./adapters/codex.js";
export { CursorComposerAdapter } from "./adapters/cursor-composer.js";
export { PiAdapter } from "./adapters/pi.js";
export { augmentedPath, buildChildProcessEnv, resolveExecutable } from "./adapters/spawn-env.js";
export { TerminalManager } from "./adapters/terminal-manager.js";
export type { TerminalCallbacks, TerminalManagerOptions } from "./adapters/terminal-manager.js";
