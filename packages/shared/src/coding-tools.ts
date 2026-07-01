/**
 * CLI metadata for each coding tool. Shared so bridges know which executable to
 * probe and the UI can render install instructions when a tool isn't present on
 * the target runtime.
 */
export interface CodingToolCli {
  /** Tool id — matches the CodingTool GraphQL/Prisma enum. */
  tool: string;
  label: string;
  /** Executable the runtime probes to decide whether the tool is installed. */
  command: string;
  /** One-line shell command to install the CLI. */
  install: string;
  /** Docs URL with fuller install/setup instructions. */
  installUrl: string;
}

export const CODING_TOOL_CLIS: Readonly<Record<string, CodingToolCli>> = {
  claude_code: {
    tool: "claude_code",
    label: "Claude Code",
    command: "claude",
    install: "npm install -g @anthropic-ai/claude-code",
    installUrl: "https://docs.claude.com/en/docs/claude-code/setup",
  },
  codex: {
    tool: "codex",
    label: "Codex",
    command: "codex",
    install: "npm install -g @openai/codex",
    installUrl: "https://developers.openai.com/codex/cli",
  },
  pi: {
    tool: "pi",
    label: "Pi",
    command: "pi",
    install: "curl -fsSL https://pi.inflection.ai/install.sh | bash",
    installUrl: "https://pi.inflection.ai",
  },
  antigravity: {
    tool: "antigravity",
    label: "Antigravity",
    command: "agy",
    install: "brew install antigravity",
    installUrl: "https://antigravity.google",
  },
  cursor_composer: {
    tool: "cursor_composer",
    label: "Cursor Composer",
    command: "cursor-agent",
    install: "curl https://cursor.com/install -fsS | bash",
    installUrl: "https://cursor.com/docs/cli/installation",
  },
};

export function getCodingToolCli(tool: string): CodingToolCli | undefined {
  return CODING_TOOL_CLIS[tool];
}

/**
 * The canonical set of `CodingTool` ids — the runnable CLIs plus the special
 * `custom` marker. Single source of truth for the server's tool allowlists so a
 * new tool can't be recognized in one place and silently dropped in another.
 * Kept in sync with the GraphQL/Prisma `CodingTool` enum.
 */
export const CODING_TOOL_IDS: readonly string[] = [...Object.keys(CODING_TOOL_CLIS), "custom"];
