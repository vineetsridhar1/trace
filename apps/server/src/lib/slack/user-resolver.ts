import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { resolveJwtSecret } from "../jwt-secret.js";
import { getSlackClient } from "./client.js";

const JWT_SECRET = resolveJwtSecret();
const LINK_STATE_TTL_SECONDS = 30 * 60;

type LinkStatePayload = {
  slackTeamId: string;
  slackUserId: string;
  tokenType: "slack_link";
};

export function signSlackLinkState(input: {
  slackTeamId: string;
  slackUserId: string;
}): string {
  return jwt.sign(
    {
      slackTeamId: input.slackTeamId,
      slackUserId: input.slackUserId,
      tokenType: "slack_link",
    } satisfies LinkStatePayload,
    JWT_SECRET,
    { expiresIn: LINK_STATE_TTL_SECONDS },
  );
}

export function verifySlackLinkState(token: string): LinkStatePayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as LinkStatePayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "slack_link" ||
      typeof payload.slackTeamId !== "string" ||
      typeof payload.slackUserId !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function resolveTraceUser(
  slackTeamId: string,
  slackUserId: string,
): Promise<string | null> {
  const account = await prisma.slackAccount.findUnique({
    where: { slackUserId_slackTeamId: { slackUserId, slackTeamId } },
    select: { userId: true },
  });
  return account?.userId ?? null;
}

function buildLinkUrl(slackTeamId: string, slackUserId: string): string {
  const base = process.env.TRACE_WEB_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const state = signSlackLinkState({ slackTeamId, slackUserId });
  const params = new URLSearchParams({
    team: slackTeamId,
    user: slackUserId,
    state,
  });
  return `${base}/slack/link?${params.toString()}`;
}

export async function postLinkPrompt(input: {
  slackTeamId: string;
  slackUserId: string;
  slackChannelId: string;
  threadTs?: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;

  const linkUrl = buildLinkUrl(input.slackTeamId, input.slackUserId);
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Link your Trace account to use `@trace` from Slack.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Link account" },
          url: linkUrl,
          style: "primary",
        },
      ],
    },
  ];

  const dm = await client.conversations
    .open({ users: input.slackUserId })
    .catch((err: unknown) => {
      console.warn("[slack] failed to open link prompt DM:", (err as Error).message);
      return null;
    });
  const dmChannel = dm?.channel?.id;
  if (dmChannel) {
    const postedDm = await client.chat
      .postMessage({
        channel: dmChannel,
        text: `Link your Trace account to use @trace from Slack: ${linkUrl}`,
        blocks,
      })
      .then(() => true)
      .catch((err: unknown) => {
        console.warn("[slack] failed to post link prompt DM:", (err as Error).message);
        return false;
      });

    if (postedDm) {
      console.info("[slack] posted account link prompt DM", {
        teamId: input.slackTeamId,
        slackUserId: input.slackUserId,
        channel: dmChannel,
      });
      await client.chat
        .postEphemeral({
          channel: input.slackChannelId,
          user: input.slackUserId,
          thread_ts: input.threadTs,
          text: "I sent you a DM to link your Trace account.",
        })
        .catch(() => {});
      return;
    }
  }

  await client.chat
    .postEphemeral({
      channel: input.slackChannelId,
      user: input.slackUserId,
      thread_ts: input.threadTs,
      text: `Link your Trace account to use @trace here: ${linkUrl}`,
      blocks,
    })
    .then(() => {
      console.info("[slack] posted account link prompt", {
        teamId: input.slackTeamId,
        slackUserId: input.slackUserId,
        channel: input.slackChannelId,
      });
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to post link prompt:", (err as Error).message);
    });
}
