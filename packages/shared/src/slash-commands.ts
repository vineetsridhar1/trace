export interface BuiltinSlashCommand {
  name: string;
  description: string;
  category: "passthrough" | "terminal" | "special";
}

export const BUILTIN_SLASH_COMMANDS: BuiltinSlashCommand[] = [
  // special
  { name: "clear", description: "Start a new session", category: "special" },
  // passthrough — sent as text message to Claude Code
  { name: "compact", description: "Compact conversation context", category: "passthrough" },
  { name: "help", description: "Show help information", category: "passthrough" },
  { name: "review", description: "Review code changes", category: "passthrough" },
  { name: "memory", description: "Edit CLAUDE.md memory files", category: "passthrough" },
  { name: "cost", description: "Show token usage and cost", category: "passthrough" },
  { name: "model", description: "Switch model", category: "passthrough" },
  // terminal — opens terminal + runs `claude /<cmd>`
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
