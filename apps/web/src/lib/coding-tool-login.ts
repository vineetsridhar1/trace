import { CREATE_TERMINAL_MUTATION } from "@trace/client-core";
import { client } from "./urql";
import { useTerminalStore } from "../stores/terminal";
import { useUIStore } from "../stores/ui";

export interface ToolLoginTerminal {
  /** Display name for the terminal tab. */
  terminalName: string;
  /** Typed into the terminal on connect; the user presses Enter to run it. */
  initialCommand: string;
}

/**
 * Per-tool interactive login flows, run inside an in-session terminal — the
 * same experience as running the CLI in a terminal and logging in there.
 */
const TOOL_LOGIN_TERMINALS: Readonly<Record<string, ToolLoginTerminal>> = {
  claude_code: { terminalName: "Claude Login", initialCommand: "claude\n/login" },
  pi: { terminalName: "Pi Login", initialCommand: "pi\n/login" },
  codex: { terminalName: "Codex Login", initialCommand: "codex login" },
  cursor_composer: { terminalName: "Cursor Login", initialCommand: "cursor-agent login" },
};

export function getToolLoginTerminal(tool: string): ToolLoginTerminal | undefined {
  return TOOL_LOGIN_TERMINALS[tool];
}

/**
 * Open a terminal on the session's runtime primed with the tool's login
 * command. Throws when the terminal cannot be created.
 */
export async function openToolLoginTerminal(
  sessionId: string,
  sessionGroupId: string,
  login: ToolLoginTerminal,
): Promise<void> {
  const result = await client
    .mutation(CREATE_TERMINAL_MUTATION, { sessionId, cols: 80, rows: 24 })
    .toPromise();

  if (result.error) {
    throw result.error;
  }

  const terminal = result.data?.createTerminal as { id: string } | null | undefined;
  if (!terminal) {
    throw new Error("Failed to open terminal");
  }

  useTerminalStore.getState().addTerminal(terminal.id, sessionId, sessionGroupId, "connecting", {
    customName: login.terminalName,
    initialCommand: login.initialCommand,
    submitInitialCommand: false,
  });

  const ui = useUIStore.getState();
  ui.setActiveSessionId(sessionId);
  ui.setActiveTerminalId(terminal.id);
  ui.setShowTerminalPanel(true);
}
