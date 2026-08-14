import type { CommandDefinition, CommandGroupDefinition } from "../runtime.js";
import { artifactCommand } from "./artifact.js";
import { channelListCommand } from "./channel/list.js";
import { contextCommand } from "./context.js";
import { repoListCommand } from "./repo/list.js";
import { sessionCommands } from "./session/index.js";
import { terminalCommands } from "./terminal/index.js";

export const commands: readonly CommandDefinition[] = [
  contextCommand,
  channelListCommand,
  repoListCommand,
  ...sessionCommands,
  ...terminalCommands,
  artifactCommand,
];

export const commandGroups: readonly CommandGroupDefinition[] = [
  {
    name: "session",
    description: "Discover and control Trace AI sessions",
    workflow: [
      'Run "$TRACE_CLI" session list --json to find a session, or "$TRACE_CLI" context --json for the current one.',
      'Run "$TRACE_CLI" session get <session-id> --json to inspect its status and destination.',
      'Use "$TRACE_CLI" session events <session-id> --limit 50 --json to assess progress before intervening.',
      "Start, message, run, stop, or archive only when the requested action requires it.",
    ],
    examples: [
      '"$TRACE_CLI" session list --json',
      '"$TRACE_CLI" session start "Implement the API tests" --json',
    ],
    notes: [
      "Read command help before lifecycle mutations; session operations change shared Trace state.",
    ],
  },
  {
    name: "terminal",
    description: "Create and control authorized managed terminals",
    workflow: [
      'Run "$TRACE_CLI" terminal list --json to discover terminals in the current session.',
      'Run "$TRACE_CLI" terminal create --json only when a shared terminal is needed.',
      'Use "$TRACE_CLI" terminal send <terminal-id> <text> --enter, then terminal capture, to run and inspect a command.',
      "Use terminal key only for its documented allowlisted keys; use terminal destroy when the terminal is no longer needed.",
    ],
    examples: [
      '"$TRACE_CLI" terminal create --cols 120 --rows 30 --json',
      '"$TRACE_CLI" terminal send <terminal-id> "pnpm test" --enter --json',
      '"$TRACE_CLI" terminal capture <terminal-id> --plain --json',
    ],
    notes: [
      "Terminal input and output are ephemeral and are not stored in Trace events.",
      "Session context is only a default selector; the server authorizes every terminal operation.",
    ],
  },
  {
    name: "channel",
    description: "Discover channels available to the session owner",
    workflow: [
      'Run "$TRACE_CLI" channel list --member-only --json to list eligible destinations.',
      'Choose a channel ID and pass it to "$TRACE_CLI" session start --channel <channel-id>.',
    ],
    examples: ['"$TRACE_CLI" channel list --member-only --json'],
    notes: ["Channels are the collaboration and session destination in Trace."],
  },
  {
    name: "repo",
    description: "Discover repositories in the current organization",
    workflow: [
      'Run "$TRACE_CLI" repo list --json to find a repository ID.',
      'Use the repository ID with a channel that has no linked repository: "$TRACE_CLI" session start --channel <channel-id> --repo <repo-id>.',
    ],
    examples: ['"$TRACE_CLI" repo list --json'],
    notes: ["Repositories support coding channels; they are not standalone session destinations."],
  },
  {
    name: "artifact",
    description: "Validate and upload immutable Trace artifacts",
    workflow: [
      "Use the required artifact skill to prepare and validate the source file or directory.",
      'Run "$TRACE_CLI" artifact push <type> <file-or-directory> --json once the artifact is ready.',
      "Keep the returned idempotency key for a safe retry if the upload fails.",
    ],
    examples: ['"$TRACE_CLI" artifact push video output/demo.mp4 --json'],
    notes: [
      "Artifact types can impose additional validation; use the relevant artifact skill when instructed.",
    ],
  },
];
