export interface BuiltinSlashCommand {
  name: string;
  description: string;
  category: "passthrough" | "terminal" | "special";
}

export const BUILTIN_SLASH_COMMANDS: BuiltinSlashCommand[] = [
  // special — handled locally by the UI
  { name: "clear", description: "Start a new session", category: "special" },
  // terminal — opens terminal + runs `claude /<cmd>` (all built-in CLI commands)
  { name: "compact", description: "Compact conversation context", category: "terminal" },
  { name: "cost", description: "Show token usage and cost", category: "terminal" },
  { name: "help", description: "Show help information", category: "terminal" },
  { name: "review", description: "Review code changes", category: "terminal" },
  { name: "memory", description: "Edit CLAUDE.md memory files", category: "terminal" },
  { name: "usage", description: "Show detailed usage statistics", category: "terminal" },
  { name: "mcp", description: "Manage MCP servers", category: "terminal" },
  { name: "config", description: "Edit configuration", category: "terminal" },
  { name: "doctor", description: "Diagnose issues", category: "terminal" },
  { name: "login", description: "Log in to Anthropic", category: "terminal" },
  { name: "logout", description: "Log out", category: "terminal" },
  { name: "init", description: "Initialize Claude Code in project", category: "terminal" },
  { name: "permissions", description: "Manage permissions", category: "terminal" },
  { name: "status", description: "Show status", category: "terminal" },
  { name: "terminal", description: "Open terminal", category: "terminal" },
  { name: "vim", description: "Toggle vim mode", category: "terminal" },
];
