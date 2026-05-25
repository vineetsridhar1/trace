import type { CodingTool } from "@prisma/client";
import { prisma } from "../db.js";
import { sessionService } from "../../services/session.js";
import { getSlackClient } from "./client.js";
import { buildTraceSessionLink, slackEventBridge } from "./event-bridge.js";

export type SlackSessionSource = "mention" | "slash" | "modal" | "bot_alert";

export type SlackSessionSettings = {
  tool?: CodingTool | null;
  model: string | null;
  reasoningEffort: string | null;
  hosting: "cloud" | "local";
  environmentId?: string | null;
  runtimeInstanceId?: string | null;
};

export type StartSlackSessionInput = {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs?: string;
  organizationId: string;
  traceChannelId: string;
  actorUserId: string;
  prompt: string;
  imageKeys?: string[];
  settings: SlackSessionSettings;
  source: SlackSessionSource;
};

export type StartSlackSessionResult = {
  sessionId: string;
  slackThreadTs: string;
};

function startMessage(sessionId: string, traceLink: string | null): string {
  const shortId = sessionId.slice(0, 8);
  return traceLink
    ? `🟢 Session started — \`${shortId}\` · <${traceLink}|Open in Trace>`
    : `🟢 Session started — \`${shortId}\``;
}

async function recordSlackThreadSession(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  sessionId: string;
  organizationId: string;
}): Promise<void> {
  await prisma.slackThreadSession.create({
    data: {
      slackTeamId: input.slackTeamId,
      slackChannelId: input.slackChannelId,
      slackThreadTs: input.slackThreadTs,
      sessionId: input.sessionId,
      organizationId: input.organizationId,
    },
  });

  slackEventBridge.attach(input.sessionId, {
    slackTeamId: input.slackTeamId,
    slackChannelId: input.slackChannelId,
    slackThreadTs: input.slackThreadTs,
  });
}

export async function startSlackSession(
  input: StartSlackSessionInput,
): Promise<StartSlackSessionResult> {
  const session = await sessionService.start({
    tool: input.settings.tool ?? undefined,
    model: input.settings.model ?? undefined,
    reasoningEffort: input.settings.reasoningEffort ?? undefined,
    environmentId: input.settings.environmentId ?? undefined,
    runtimeInstanceId: input.settings.runtimeInstanceId ?? undefined,
    organizationId: input.organizationId,
    createdById: input.actorUserId,
    channelId: input.traceChannelId,
    hosting: input.settings.hosting,
    prompt: input.prompt,
    imageKeys: input.imageKeys,
    deferInitialRun: true,
    actorType: "user",
    clientSource: "slack",
  });

  const client = await getSlackClient(input.slackTeamId);
  const traceLink = await buildTraceSessionLink(session.id);
  const text = startMessage(session.id, traceLink);
  let slackThreadTs = input.slackThreadTs ?? `${Date.now() / 1000}`;

  if (input.slackThreadTs) {
    await recordSlackThreadSession({
      slackTeamId: input.slackTeamId,
      slackChannelId: input.slackChannelId,
      slackThreadTs,
      sessionId: session.id,
      organizationId: input.organizationId,
    });
  }

  if (client) {
    const message = await client.chat
      .postMessage({
        channel: input.slackChannelId,
        ...(input.slackThreadTs ? { thread_ts: input.slackThreadTs } : {}),
        text,
      })
      .catch((err: unknown) => {
        console.warn("[slack] failed to post start message:", (err as Error).message);
        return null;
      });
    if (!input.slackThreadTs && typeof message?.ts === "string" && message.ts) {
      slackThreadTs = message.ts;
    }
  }

  if (!input.slackThreadTs) {
    await recordSlackThreadSession({
      slackTeamId: input.slackTeamId,
      slackChannelId: input.slackChannelId,
      slackThreadTs,
      sessionId: session.id,
      organizationId: input.organizationId,
    });
  }

  if (input.prompt.trim() || input.imageKeys?.length) {
    await sessionService.run(
      session.id,
      input.prompt,
      undefined,
      {
        userId: input.actorUserId,
        organizationId: input.organizationId,
        clientSource: "slack",
      },
      input.imageKeys,
    );
  }

  return { sessionId: session.id, slackThreadTs };
}
