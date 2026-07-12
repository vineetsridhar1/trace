import type { CodingTool, SessionGroupKind } from "@prisma/client";
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
  traceChannelId?: string | null;
  actorUserId: string;
  prompt: string;
  imageKeys?: string[];
  settings: SlackSessionSettings;
  source: SlackSessionSource;
  kind?: SessionGroupKind;
};

export type StartSlackSessionResult = {
  sessionId: string;
  slackThreadTs: string;
};

function startMessage(
  sessionId: string,
  traceLink: string | null,
  kind: SessionGroupKind | undefined,
): string {
  const shortId = sessionId.slice(0, 8);
  const label = kind === "app" ? "App build started" : "Session started";
  return traceLink
    ? `🟢 ${label} — \`${shortId}\` · <${traceLink}|Open in Trace>`
    : `🟢 ${label} — \`${shortId}\``;
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
  const client = await getSlackClient(input.slackTeamId);
  let slackThreadTs = input.slackThreadTs;
  let topLevelMessageTs: string | null = null;

  if (!slackThreadTs) {
    if (!client) throw new Error("Slack bot token not found");
    const message = await client.chat
      .postMessage({
        channel: input.slackChannelId,
        text: "Starting Trace session…",
      })
      .catch((err: unknown) => {
        console.warn("[slack] failed to create start thread:", (err as Error).message);
        return null;
      });
    if (typeof message?.ts !== "string" || !message.ts) {
      throw new Error("Could not create Slack thread for Trace session");
    }
    slackThreadTs = message.ts;
    topLevelMessageTs = message.ts;
  }

  const session = await sessionService.start({
    kind: input.kind,
    tool: input.settings.tool ?? undefined,
    model: input.settings.model ?? undefined,
    reasoningEffort: input.settings.reasoningEffort ?? undefined,
    environmentId: input.settings.environmentId ?? undefined,
    runtimeInstanceId:
      input.kind === "app" ? undefined : (input.settings.runtimeInstanceId ?? undefined),
    organizationId: input.organizationId,
    createdById: input.actorUserId,
    channelId: input.kind === "app" ? undefined : (input.traceChannelId ?? undefined),
    hosting: input.kind === "app" ? "cloud" : input.settings.hosting,
    prompt: input.prompt,
    imageKeys: input.imageKeys,
    deferInitialRun: true,
    actorType: "user",
    clientSource: "slack",
  });

  await recordSlackThreadSession({
    slackTeamId: input.slackTeamId,
    slackChannelId: input.slackChannelId,
    slackThreadTs,
    sessionId: session.id,
    organizationId: input.organizationId,
  });
  if (input.kind === "app" && session.sessionGroupId) {
    slackEventBridge.attachGroup(session.sessionGroupId, {
      slackTeamId: input.slackTeamId,
      slackChannelId: input.slackChannelId,
      slackThreadTs,
    });
  }

  const traceLink = await buildTraceSessionLink(session.id);
  const text = startMessage(session.id, traceLink, input.kind);

  if (client) {
    if (topLevelMessageTs) {
      await client.chat
        .update({
          channel: input.slackChannelId,
          ts: topLevelMessageTs,
          text,
        })
        .catch((err: unknown) => {
          console.warn("[slack] failed to update start message:", (err as Error).message);
        });
    } else {
      await client.chat
        .postMessage({
          channel: input.slackChannelId,
          thread_ts: slackThreadTs,
          text,
        })
        .catch((err: unknown) => {
          console.warn("[slack] failed to post start message:", (err as Error).message);
        });
    }
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
