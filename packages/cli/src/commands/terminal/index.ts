import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionBoolean, optionInteger, optionString } from "../../runtime.js";
import { resolveSessionId } from "../session/shared.js";

type TerminalView = {
  id: string;
  sessionId: string;
  status: string;
  cols?: number | null;
  rows?: number | null;
  connected: boolean;
};

const KEYS: Readonly<Record<string, string>> = {
  enter: "\r",
  tab: "\t",
  escape: "\u001b",
  backspace: "\u007f",
  up: "\u001b[A",
  down: "\u001b[B",
  left: "\u001b[D",
  right: "\u001b[C",
  "ctrl-c": "\u0003",
  "ctrl-d": "\u0004",
  "ctrl-l": "\u000c",
};

function terminalLine(terminal: TerminalView): string {
  return `${terminal.id}\t${terminal.sessionId}\t${terminal.status}\t${terminal.cols ?? "-"}x${terminal.rows ?? "-"}\t${terminal.connected ? "connected" : "disconnected"}`;
}

function requiredTerminalId(input: { positionals: readonly string[] }): string {
  return input.positionals[0]!;
}

const sessionOption = {
  name: "session",
  flag: "--session",
  kind: "string",
  valueName: "ID",
  description: "Session ID; defaults to TRACE_SESSION_ID",
} as const;

export const terminalCommands = [
  defineCommand({
    path: ["terminal", "list"],
    description: "List terminals authorized for a session",
    examples: ['"$TRACE_CLI" terminal list --json'],
    effects: ["Read-only; does not create, attach to, or modify a terminal."],
    output: "Terminal IDs with owning session, state, dimensions, and runtime connectivity.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect output.'],
    options: [sessionOption],
    async run(ctx, input) {
      const sessionId = resolveSessionId(ctx, optionString(input, "session"));
      const client = await ctx.client();
      const result = await client.graphql<{ sessionTerminals: TerminalView[] }, { sessionId: string }>(
        traceCliOperations.sessionTerminals,
        { sessionId },
      );
      ctx.output(
        { terminals: result.sessionTerminals },
        result.sessionTerminals.length ? result.sessionTerminals.map(terminalLine).join("\n") : "No terminals found",
      );
    },
  }),
  defineCommand({
    path: ["terminal", "create"],
    description: "Create a managed terminal on the session runtime",
    examples: ['"$TRACE_CLI" terminal create --cols 120 --rows 30 --json'],
    effects: ["Creates a PTY on the session's authorized runtime; it does not execute a command."],
    output: "The new terminal ID, session, initial state, dimensions, and connectivity.",
    nextSteps: ['Use "$TRACE_CLI" terminal send <terminal-id> <text> --enter to run a command.'],
    options: [
      sessionOption,
      { name: "cols", flag: "--cols", kind: "integer", valueName: "N", min: 20, max: 500, description: "Columns, from 20 to 500 (default: 80)" },
      { name: "rows", flag: "--rows", kind: "integer", valueName: "N", min: 5, max: 200, description: "Rows, from 5 to 200 (default: 24)" },
    ],
    async run(ctx, input) {
      const variables = { sessionId: resolveSessionId(ctx, optionString(input, "session")), cols: optionInteger(input, "cols") ?? 80, rows: optionInteger(input, "rows") ?? 24 };
      const result = await (await ctx.client()).graphql<{ createTerminal: TerminalView }, typeof variables>(traceCliOperations.createTerminal, variables);
      ctx.output({ terminal: result.createTerminal }, terminalLine(result.createTerminal));
    },
  }),
  defineCommand({
    path: ["terminal", "open"],
    description: "Open and select a new terminal tab, optionally running a command",
    examples: [
      '"$TRACE_CLI" terminal open --json',
      '"$TRACE_CLI" terminal open "pnpm dev" --json',
    ],
    effects: [
      "Creates a PTY and selects its tab for the requesting user.",
      "When provided, the command is sent directly to the PTY and is never stored in Trace events.",
    ],
    output: "The new terminal metadata and whether a command was sent, without echoing command text.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect output.'],
    positionals: [{ name: "command", required: false }],
    options: [
      sessionOption,
      { name: "cols", flag: "--cols", kind: "integer", valueName: "N", min: 20, max: 500, description: "Columns, from 20 to 500 (default: 80)" },
      { name: "rows", flag: "--rows", kind: "integer", valueName: "N", min: 5, max: 200, description: "Rows, from 5 to 200 (default: 24)" },
    ],
    async run(ctx, input) {
      const variables = {
        sessionId: resolveSessionId(ctx, optionString(input, "session")),
        cols: optionInteger(input, "cols") ?? 80,
        rows: optionInteger(input, "rows") ?? 24,
      };
      const client = await ctx.client();
      const result = await client.graphql<{ createTerminal: TerminalView }, typeof variables>(traceCliOperations.openTerminal, variables);
      const command = input.positionals[0];
      if (command) {
        await client.graphql<{ sendTerminalInput: boolean }, { terminalId: string; data: string }>(
          traceCliOperations.sendTerminalInput,
          { terminalId: result.createTerminal.id, data: `${command}\r` },
        );
      }
      ctx.output(
        { terminal: result.createTerminal, commandSent: !!command },
        terminalLine(result.createTerminal),
      );
    },
  }),
  defineCommand({
    path: ["terminal", "capture"],
    description: "Capture bounded terminal scrollback; ANSI is preserved by default",
    examples: ['"$TRACE_CLI" terminal capture <terminal-id> --plain --json'],
    effects: ["Read-only; captures only ephemeral bounded relay scrollback."],
    output: "Output, byte count, truncation state, timestamp, and terminal connectivity state.",
    nextSteps: ['Use "$TRACE_CLI" terminal send <terminal-id> <text> --enter to provide more input.'],
    positionals: [{ name: "terminal-id", required: true }],
    options: [
      { name: "maxBytes", flag: "--max-bytes", kind: "integer", valueName: "N", min: 1, max: 51200, description: "Output byte limit, from 1 to 51200" },
      { name: "plain", flag: "--plain", kind: "boolean", description: "Strip ANSI escape sequences" },
    ],
    async run(ctx, input) {
      const variables = { terminalId: requiredTerminalId(input), maxBytes: optionInteger(input, "maxBytes"), plainText: optionBoolean(input, "plain") };
      const result = await (await ctx.client()).graphql<{ terminalCapture: { terminalId: string; output: string; byteCount: number; truncated: boolean; capturedAt: string; closed: boolean; connected: boolean } }, typeof variables>(traceCliOperations.terminalCapture, variables);
      ctx.output({ capture: result.terminalCapture }, result.terminalCapture.output);
    },
  }),
  defineCommand({
    path: ["terminal", "send"],
    description: "Write bounded text to an existing managed terminal",
    examples: ['"$TRACE_CLI" terminal send <terminal-id> "pnpm test" --enter --json'],
    effects: ["Writes to the selected terminal PTY; sent text is never included in Trace events."],
    output: "A confirmation containing the terminal ID, without echoing the sent text.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect command output.'],
    positionals: [{ name: "terminal-id", required: true }, { name: "text", required: true }],
    options: [{ name: "enter", flag: "--enter", kind: "boolean", description: "Append a carriage-return Enter key" }],
    async run(ctx, input) {
      const variables = { terminalId: requiredTerminalId(input), data: `${input.positionals[1]!}${optionBoolean(input, "enter") ? "\r" : ""}` };
      await (await ctx.client()).graphql<{ sendTerminalInput: boolean }, typeof variables>(traceCliOperations.sendTerminalInput, variables);
      ctx.output({ terminalId: variables.terminalId, sent: true }, "Sent");
    },
  }),
  defineCommand({
    path: ["terminal", "key"],
    description: "Send an allowlisted terminal key (for example ctrl-c or enter)",
    examples: ['"$TRACE_CLI" terminal key <terminal-id> ctrl-c --json'],
    effects: ["Writes only the documented key byte sequence to the selected terminal PTY."],
    output: "A confirmation containing the terminal ID and allowlisted key name.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect the terminal state.'],
    positionals: [{ name: "terminal-id", required: true }, { name: "key", required: true }],
    async run(ctx, input) {
      const key = input.positionals[1]!.toLowerCase();
      const data = KEYS[key];
      if (!data) usage(`Invalid terminal key: ${key}. Allowed keys: ${Object.keys(KEYS).join(", ")}`);
      const variables = { terminalId: requiredTerminalId(input), data };
      await (await ctx.client()).graphql<{ sendTerminalInput: boolean }, typeof variables>(traceCliOperations.sendTerminalInput, variables);
      ctx.output({ terminalId: variables.terminalId, key, sent: true }, "Sent");
    },
  }),
  defineCommand({
    path: ["terminal", "resize"],
    description: "Resize an existing managed terminal",
    examples: ['"$TRACE_CLI" terminal resize <terminal-id> --cols 140 --rows 40 --json'],
    effects: ["Resizes the selected terminal PTY; no shell command is executed."],
    output: "A confirmation containing the terminal ID without terminal contents.",
    nextSteps: ['Use "$TRACE_CLI" terminal capture <terminal-id> --json to inspect post-resize output.'],
    positionals: [{ name: "terminal-id", required: true }],
    options: [
      { name: "cols", flag: "--cols", kind: "integer", valueName: "N", min: 20, max: 500, description: "Columns, from 20 to 500" },
      { name: "rows", flag: "--rows", kind: "integer", valueName: "N", min: 5, max: 200, description: "Rows, from 5 to 200" },
    ],
    async run(ctx, input) {
      const cols = optionInteger(input, "cols");
      const rows = optionInteger(input, "rows");
      if (cols === undefined || rows === undefined) usage("--cols and --rows are required");
      const variables = { terminalId: requiredTerminalId(input), cols, rows };
      await (await ctx.client()).graphql<{ resizeTerminal: boolean }, typeof variables>(traceCliOperations.resizeTerminal, variables);
      ctx.output({ terminalId: variables.terminalId, resized: true }, "Resized");
    },
  }),
  defineCommand({
    path: ["terminal", "destroy"],
    description: "Destroy an existing managed terminal",
    examples: ['"$TRACE_CLI" terminal destroy <terminal-id> --json'],
    effects: ["Terminates the selected managed terminal and releases its ephemeral relay state."],
    output: "A destruction confirmation containing the terminal ID.",
    nextSteps: ['Run "$TRACE_CLI" terminal list --json to verify the terminal is gone.'],
    positionals: [{ name: "terminal-id", required: true }],
    async run(ctx, input) {
      const variables = { terminalId: requiredTerminalId(input) };
      await (await ctx.client()).graphql<{ destroyTerminal: boolean }, typeof variables>(traceCliOperations.destroyTerminal, variables);
      ctx.output({ terminalId: variables.terminalId, destroyed: true }, "Destroyed");
    },
  }),
] as const;
