export interface BuiltinSlashCommand {
  name: string;
  description: string;
  category: "passthrough" | "terminal" | "special";
}

export const BUILTIN_SLASH_COMMANDS: BuiltinSlashCommand[] = [
  // Special — handled locally by the UI so the app stays consistent with the new session model.
  { name: "clear", description: "Start a new session", category: "special" },
  // Built-ins are session commands in Claude Code, so they should be passed through
  // to the active tool session instead of spawning a separate shell process.
  { name: "add-dir", description: "Add a working directory for this session", category: "passthrough" },
  { name: "agents", description: "Manage agent configurations", category: "passthrough" },
  { name: "btw", description: "Ask a side question without adding it to the conversation", category: "passthrough" },
  { name: "compact", description: "Compact conversation context", category: "passthrough" },
  { name: "config", description: "Open settings", category: "passthrough" },
  { name: "context", description: "Visualize current context usage", category: "passthrough" },
  { name: "cost", description: "Show token usage statistics", category: "passthrough" },
  { name: "diff", description: "Open the interactive diff viewer", category: "passthrough" },
  { name: "doctor", description: "Diagnose Claude Code setup issues", category: "passthrough" },
  { name: "effort", description: "Adjust the model effort level", category: "passthrough" },
  { name: "help", description: "Show help and available commands", category: "passthrough" },
  { name: "hooks", description: "View hook configurations", category: "passthrough" },
  { name: "ide", description: "Manage IDE integrations", category: "passthrough" },
  { name: "init", description: "Initialize CLAUDE.md in the project", category: "passthrough" },
  { name: "insights", description: "Analyze Claude Code session patterns", category: "passthrough" },
  { name: "keybindings", description: "Open keybindings configuration", category: "passthrough" },
  { name: "login", description: "Sign in to Anthropic", category: "passthrough" },
  { name: "logout", description: "Sign out from Anthropic", category: "passthrough" },
  { name: "mcp", description: "Manage MCP servers", category: "passthrough" },
  { name: "memory", description: "Edit CLAUDE.md memory files", category: "passthrough" },
  { name: "model", description: "Select or change the AI model", category: "passthrough" },
  { name: "permissions", description: "Manage tool permission rules", category: "passthrough" },
  { name: "plan", description: "Enter plan mode", category: "passthrough" },
  { name: "plugin", description: "Manage Claude Code plugins", category: "passthrough" },
  { name: "pr-comments", description: "Fetch pull request comments", category: "passthrough" },
  { name: "release-notes", description: "View recent release notes", category: "passthrough" },
  { name: "remote-env", description: "Configure the default remote environment", category: "passthrough" },
  { name: "rename", description: "Rename the current session", category: "passthrough" },
  { name: "resume", description: "Resume a previous conversation", category: "passthrough" },
  { name: "rewind", description: "Rewind the conversation or code to an earlier point", category: "passthrough" },
  { name: "sandbox", description: "Toggle sandbox mode", category: "passthrough" },
  { name: "schedule", description: "Create or run scheduled tasks", category: "passthrough" },
  { name: "security-review", description: "Review pending changes for security issues", category: "passthrough" },
  { name: "skills", description: "List available skills", category: "passthrough" },
  { name: "stats", description: "Show usage and session history stats", category: "passthrough" },
  { name: "status", description: "Open the status view", category: "passthrough" },
  { name: "statusline", description: "Configure the Claude Code status line", category: "passthrough" },
  { name: "tasks", description: "List and manage background tasks", category: "passthrough" },
  { name: "usage", description: "Show plan usage and rate limit status", category: "passthrough" },
  { name: "vim", description: "Toggle Vim mode", category: "passthrough" },
];
