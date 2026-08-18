import type { CommandDefinition, CommandGroupDefinition } from "../runtime.js";
import { artifactCommand } from "./artifact.js";
import { appCommands } from "./app/index.js";
import { browserCommands } from "./browser/index.js";
import { channelListCommand } from "./channel/list.js";
import { channelLinkRepoCommand } from "./channel/link-repo.js";
import { contextCommand } from "./context.js";
import { integrationCommands } from "./integration/index.js";
import { portCommands } from "./port/index.js";
import { repoListCommand } from "./repo/list.js";
import { repoAttachRemoteCommand } from "./repo/attach-remote.js";
import { repoCreateCommand } from "./repo/create.js";
import { sessionCommands } from "./session/index.js";
import { terminalCommands } from "./terminal/index.js";

export const commands: readonly CommandDefinition[] = [
  contextCommand,
  ...appCommands,
  ...browserCommands,
  ...integrationCommands,
  ...portCommands,
  channelListCommand,
  channelLinkRepoCommand,
  repoListCommand,
  repoCreateCommand,
  repoAttachRemoteCommand,
  ...sessionCommands,
  ...terminalCommands,
  artifactCommand,
];

export const commandGroups: readonly CommandGroupDefinition[] = [
  {
    name: "browser",
    description: "Open websites in the current Trace workspace",
    workflow: ['Run "$TRACE_CLI" browser open <url> --json to request a browser tab.'],
    examples: ['"$TRACE_CLI" browser open https://example.com --json'],
    notes: [
      "Browser requests target only the requesting user and the current session group.",
    ],
  },
  {
    name: "app",
    description: "Control live cloud-session applications and durable deployments",
    workflow: [
      'Run "$TRACE_CLI" app list --json to discover configured applications, processes, and preview URLs.',
      'Use "$TRACE_CLI" app start, stop, restart, and logs to control live cloud-session servers.',
      "Inspect the project and verify its production build before invoking the CLI.",
      'Choose static hosting or a running service, then run "$TRACE_CLI" app deploy with every required fact.',
      'Run "$TRACE_CLI" app status --json to monitor the backend-owned workflow after the session ends.',
    ],
    examples: [
      '"$TRACE_CLI" app deploy --target static --output-directory dist --build-command "pnpm build" --json',
      '"$TRACE_CLI" app status --json',
    ],
    notes: [
      "Live application controls require a connected cloud session and fail for local sessions.",
      "The CLI never analyzes code or chooses infrastructure.",
      "The latest pushed app commit is the immutable deployment source.",
    ],
  },
  {
    name: "port",
    description: "Forward arbitrary cloud-session ports independently of applications",
    workflow: [
      'Run "$TRACE_CLI" port list --json to inspect configured and arbitrary endpoints.',
      'Run "$TRACE_CLI" port forward <port> --json after starting any HTTP server on the cloud runtime.',
      'Use "$TRACE_CLI" port disable or port enable without stopping or restarting the server.',
    ],
    examples: [
      '"$TRACE_CLI" port forward 5173 --json',
      '"$TRACE_CLI" port disable <endpoint-id> --json',
    ],
    notes: [
      "Port forwarding is independent of repo application commands and configured application ports.",
      "Public is the default for newly forwarded arbitrary ports; use --access private when required.",
      "Port controls fail for local sessions; forwarding and enabling require a connected cloud runtime.",
    ],
  },
  {
    name: "integration",
    description: "Discover, connect, and configure data providers for the current Trace app",
    workflow: [
      'Run "$TRACE_CLI" integration list --json to inspect the live provider catalog, connected accounts, and current app access.',
      'If the required account is missing, run "$TRACE_CLI" integration connect and have the user complete the returned OAuth link.',
      'Run "$TRACE_CLI" integration add with only the capabilities required by the app.',
      "Follow the integration and capability guides returned by integration list when writing the app's Node route.",
      'Run "$TRACE_CLI" integration list again to verify the final connection and app-access state.',
    ],
    examples: [
      '"$TRACE_CLI" integration list --json',
      '"$TRACE_CLI" integration add github --capabilities profile --identity viewer --json',
    ],
    notes: [
      "The current app is selected automatically from TRACE_SESSION_GROUP_ID; never ask for a binding UUID.",
      "Put provider requests in generated Node routes and have the browser call only same-origin /api routes.",
      "Do not call Trace GraphQL directly, expose credentials, accept SQL from the browser, or silently broaden capabilities.",
      "Viewer identity uses each viewer's account; shared and service identities require an explicit connection ID.",
    ],
  },
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
      'Run "$TRACE_CLI" terminal open [command] --json to create and select a terminal tab.',
      'Use "$TRACE_CLI" terminal send <terminal-id> <text> --enter, then terminal capture, to run and inspect a command.',
      "Use terminal key only for its documented allowlisted keys; use terminal destroy when the terminal is no longer needed.",
    ],
    examples: [
      '"$TRACE_CLI" terminal create --cols 120 --rows 30 --json',
      '"$TRACE_CLI" terminal open "pnpm test" --json',
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
      'If a project has no repository, run "$TRACE_CLI" channel link-repo <channel-id> <repo-id> --json.',
      'Choose a channel ID and pass it to "$TRACE_CLI" session start --channel <channel-id>.',
    ],
    examples: [
      '"$TRACE_CLI" channel list --member-only --json',
      '"$TRACE_CLI" channel link-repo <channel-id> <repo-id> --json',
    ],
    notes: ["Channels are the collaboration and session destination in Trace."],
  },
  {
    name: "repo",
    description: "Create and discover repositories in the current organization",
    workflow: [
      'Run "$TRACE_CLI" repo list --json to find a repository ID.',
      'If the repository is not registered yet, run "$TRACE_CLI" repo create <name> --json.',
      'If the repository is local-only, run "$TRACE_CLI" repo attach-remote <repo-id> <remote-url> --json.',
      'Link it to a project with "$TRACE_CLI" channel link-repo <channel-id> <repo-id> --json.',
    ],
    examples: [
      '"$TRACE_CLI" repo list --json',
      '"$TRACE_CLI" repo create app --json',
      '"$TRACE_CLI" repo attach-remote <repo-id> https://github.com/acme/app.git --json',
    ],
    notes: ["Repositories provide optional context for projects, artifacts, and sessions."],
  },
  {
    name: "artifact",
    description: "Validate and upload immutable Trace artifacts",
    workflow: [
      "Use the required artifact skill to prepare and validate the source file or directory.",
      'Run "$TRACE_CLI" artifact push <type> <file-or-directory> --json once the artifact is ready.',
      "Keep the returned idempotency key for a safe retry if the upload fails.",
    ],
    examples: ['"$TRACE_CLI" artifact push visual-plan docs/plan --key primary --json'],
    notes: [
      "Artifact types can impose additional validation; use the relevant artifact skill when instructed.",
    ],
  },
];
