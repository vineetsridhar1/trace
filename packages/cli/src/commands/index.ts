import type { CommandDefinition, CommandGroupDefinition } from "../runtime.js";
import { artifactCommand } from "./artifact.js";
import { channelListCommand } from "./channel/list.js";
import { contextCommand } from "./context.js";
import { integrationCommands } from "./integration/index.js";
import { projectListCommand } from "./project/list.js";
import { repoListCommand } from "./repo/list.js";
import { sessionCommands } from "./session/index.js";

export const commands: readonly CommandDefinition[] = [
  contextCommand,
  ...integrationCommands,
  channelListCommand,
  repoListCommand,
  projectListCommand,
  ...sessionCommands,
  artifactCommand,
];

export const commandGroups: readonly CommandGroupDefinition[] = [
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
    examples: [
      '"$TRACE_CLI" session list --json',
      '"$TRACE_CLI" session start "Implement the API tests" --json',
    ],
    notes: [
      "Read command help before lifecycle mutations; session operations change shared Trace state.",
    ],
  },
  {
    name: "channel",
    description: "Discover channels available to the session owner",
  },
  {
    name: "repo",
    description: "Discover repositories in the current organization",
  },
  {
    name: "project",
    description: "Discover projects in the current organization",
  },
  {
    name: "artifact",
    description: "Validate and upload immutable Trace artifacts",
    notes: [
      "Artifact types can impose additional validation; use the relevant artifact skill when instructed.",
    ],
  },
];
