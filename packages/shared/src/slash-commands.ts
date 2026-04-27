export interface BuiltinSlashCommand {
  name: string;
  description: string;
  category: "passthrough" | "terminal" | "special";
}

export const BUILTIN_SLASH_COMMANDS: BuiltinSlashCommand[] = [
  // Special — handled locally by the UI so the app stays consistent with the new session model.
  { name: "clear", description: "Start a new session", category: "special" },
  // Trace drives Claude Code through `claude -p --resume`, not the interactive terminal UI.
  // Only surface built-ins that still make sense as prompt-oriented session actions here.
  {
    name: "add-dir",
    description: "Add a working directory for this session",
    category: "passthrough",
  },
  {
    name: "btw",
    description: "Ask a side question without adding it to the conversation",
    category: "passthrough",
  },
  { name: "compact", description: "Compact conversation context", category: "passthrough" },
  { name: "init", description: "Initialize CLAUDE.md in the project", category: "passthrough" },
  { name: "plan", description: "Enter plan mode", category: "passthrough" },
  { name: "pr-comments", description: "Fetch pull request comments", category: "passthrough" },
  { name: "schedule", description: "Create or run scheduled tasks", category: "passthrough" },
  {
    name: "security-review",
    description: "Review pending changes for security issues",
    category: "passthrough",
  },
  { name: "skills", description: "List available skills", category: "passthrough" },
];
