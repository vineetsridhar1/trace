import type { CodingTool, ConvertSessionGroupInput, SessionGroupKind } from "@trace/gql";
import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionString } from "../../runtime.js";
import {
  CODING_TOOLS,
  printSession,
  resolveSessionId,
  SESSION_KINDS,
  type SessionView,
} from "./shared.js";

const CONVERSION_KINDS = SESSION_KINDS.filter(
  (kind) => kind !== "general" && kind !== "design_system",
);

export const sessionConvertCommand = defineCommand({
  path: ["session", "convert"],
  description: "Convert the current general session into a specialized session",
  examples: [
    '"$TRACE_CLI" session convert --channel <channel-id> --json',
    '"$TRACE_CLI" session convert --kind app --json',
  ],
  effects: [
    "Changes the existing session group in place and preserves its conversation history.",
    "Prepares the target workspace and resumes the request with its session-specific instructions.",
    "App, Design, PDF, and Animation targets create an isolated managed repo in a cloud runtime.",
  ],
  output: "The converted session.",
  nextSteps: [
    'Use "$TRACE_CLI" session events <session-id> --limit 50 --json to monitor the resumed run.',
  ],
  notes: [
    "Conversion starts from a General session. Design System authoring uses its dedicated creation flow.",
    "Coding is the default target and may be selected automatically for focused coding work.",
    "Coding requires a project/channel with a linked repository so Trace can create its worktree.",
    "Before any non-coding conversion, ask the user to confirm that exact target kind and wait for their response.",
  ],
  options: [
    {
      name: "session",
      flag: "--session",
      kind: "string",
      valueName: "ID",
      description: "Source session",
    },
    {
      name: "kind",
      flag: "--kind",
      kind: "string",
      valueName: "KIND",
      choices: CONVERSION_KINDS,
      description: "Target session kind (default: coding)",
    },
    {
      name: "channel",
      flag: "--channel",
      kind: "string",
      valueName: "ID",
      description: "Target coding channel",
    },
    {
      name: "tool",
      flag: "--tool",
      kind: "string",
      valueName: "TOOL",
      choices: CODING_TOOLS,
      description: "Coding tool override",
    },
    {
      name: "model",
      flag: "--model",
      kind: "string",
      valueName: "MODEL",
      description: "Model override",
    },
    {
      name: "reasoning",
      flag: "--reasoning",
      kind: "string",
      valueName: "EFFORT",
      description: "Reasoning override",
    },
  ],
  async run(ctx, parsed) {
    const kind = (optionString(parsed, "kind") ?? "coding") as SessionGroupKind;
    if (!CONVERSION_KINDS.includes(kind as (typeof CONVERSION_KINDS)[number])) {
      usage(`--kind must be one of: ${CONVERSION_KINDS.join(", ")}`);
    }

    const client = await ctx.client();
    const source = await client.graphql<
      {
        session: {
          sessionGroupId?: string | null;
          channel?: { id: string; name: string } | null;
        } | null;
      },
      { id: string }
    >(traceCliOperations.session, {
      id: resolveSessionId(ctx, optionString(parsed, "session")),
    });
    if (!source.session?.sessionGroupId) {
      usage("Session does not belong to a session group");
    }

    let channelId: string | undefined;
    let repoId: string | undefined;
    const explicitChannelId = optionString(parsed, "channel");
    if (kind === "coding") {
      channelId = explicitChannelId ?? source.session.channel?.id;
      if (!channelId) {
        usage(
          'A coding channel is required. Provide --channel <channel-id>; discover channels with "$TRACE_CLI" channel list --member-only --json.',
        );
      }
      const channel = await client.graphql<
        {
          channel: { id: string; name: string; repo?: { id: string; name: string } | null } | null;
        },
        { id: string }
      >(traceCliOperations.startChannel, { id: channelId });
      if (!channel.channel) usage(`Channel not found: ${channelId}`);

      const impliedRepo = channel.channel.repo ?? null;
      repoId = impliedRepo?.id;
      if (!repoId) {
        usage(
          `The selected project/channel has no linked repository, so Trace cannot create a coding worktree. Link one with "$TRACE_CLI" channel link-repo ${channelId} <repo-id> --json, then retry.`,
        );
      }
    } else if (explicitChannelId) {
      usage(`${kind} conversions create an isolated workspace; remove --channel`);
    }

    const input: ConvertSessionGroupInput = {
      sessionGroupId: source.session.sessionGroupId,
      kind,
      ...(channelId ? { channelId } : {}),
      ...(repoId ? { repoId } : {}),
      tool: optionString(parsed, "tool") as CodingTool | undefined,
      model: optionString(parsed, "model"),
      reasoningEffort: optionString(parsed, "reasoning"),
    };
    const result = await client.graphql<
      { convertSessionGroup: SessionView },
      { input: ConvertSessionGroupInput }
    >(traceCliOperations.convertSessionGroup, { input });
    ctx.output({ session: result.convertSessionGroup }, printSession(result.convertSessionGroup));
  },
});
