import type { CodingTool, SessionGroupKind } from "@trace/gql";
import { traceCliOperations } from "@trace/cli-contract";
import { usage } from "../../errors.js";
import { defineCommand, optionString } from "../../runtime.js";
import { CODING_TOOLS, printSession, resolveSessionId, type SessionView } from "./shared.js";

type ConvertSessionGroupInput = {
  sessionGroupId: string;
  kind: SessionGroupKind;
  channelId: string;
  repoId?: string;
  tool?: CodingTool;
  model?: string;
  reasoningEffort?: string;
};

export const sessionConvertCommand = defineCommand({
  path: ["session", "convert"],
  description: "Convert the current general session into a coding session",
  examples: ['"$TRACE_CLI" session convert --kind coding --channel <channel-id> --json'],
  effects: [
    "Changes the existing session group in place and preserves its conversation history.",
    "Prepares the selected channel's repository workspace and resumes the request there.",
  ],
  output: "The converted session.",
  nextSteps: [
    'Use "$TRACE_CLI" session events <session-id> --limit 50 --json to monitor the resumed run.',
  ],
  notes: [
    "Only general-to-coding conversion is currently supported.",
    "A coding channel is required; --repo may only supply a repository when that channel has none.",
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
      choices: ["coding"],
      description: "Target session kind",
    },
    {
      name: "channel",
      flag: "--channel",
      kind: "string",
      valueName: "ID",
      description: "Target coding channel",
    },
    {
      name: "repo",
      flag: "--repo",
      kind: "string",
      valueName: "ID",
      description: "Repository for a channel without one",
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
    if (optionString(parsed, "kind") !== "coding") {
      usage("--kind coding is required");
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

    const channelId = optionString(parsed, "channel") ?? source.session.channel?.id;
    if (!channelId) {
      usage(
        'A coding channel is required. Provide --channel <channel-id>; discover channels with "$TRACE_CLI" channel list --member-only --json.',
      );
    }
    const channel = await client.graphql<
      { channel: { id: string; name: string; repo?: { id: string; name: string } | null } | null },
      { id: string }
    >(traceCliOperations.startChannel, { id: channelId });
    if (!channel.channel) usage(`Channel not found: ${channelId}`);

    const explicitRepoId = optionString(parsed, "repo");
    const impliedRepo = channel.channel.repo ?? null;
    if (impliedRepo && explicitRepoId && explicitRepoId !== impliedRepo.id) {
      usage(
        `The selected channel uses repo ${impliedRepo.id} (${impliedRepo.name}); remove --repo or use that repo`,
      );
    }
    const repoId = impliedRepo?.id ?? explicitRepoId;
    if (!repoId) {
      usage(
        "The selected channel has no linked repository. Provide --repo <repo-id>, or choose a coding channel with a repository.",
      );
    }

    const input: ConvertSessionGroupInput = {
      sessionGroupId: source.session.sessionGroupId,
      kind: "coding",
      channelId,
      repoId,
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
