import { Router, type Router as RouterType, type Request, type Response } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db.js";
import { encryptSecret } from "../lib/encryption.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { authenticateAccessToken, getRequestToken } from "../lib/auth.js";
import { verifySlackSignature } from "../lib/slack/signature.js";
import { getSlackClient, invalidateSlackClient } from "../lib/slack/client.js";
import {
  postLinkPrompt,
  resolveTraceUser,
  verifySlackLinkState,
} from "../lib/slack/user-resolver.js";
import { slackEventBridge } from "../lib/slack/event-bridge.js";
import { sessionService } from "../services/session.js";

const JWT_SECRET = resolveJwtSecret();
const INSTALL_STATE_TTL_SECONDS = 10 * 60;
const SLACK_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "chat:write.public",
  "commands",
  "im:write",
  "users:read",
  "channels:history",
  "groups:history",
].join(",");

type InstallStatePayload = {
  organizationId: string;
  userId: string;
  tokenType: "slack_install";
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function renderHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0b0e;color:#e6e6ea;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{max-width:480px;padding:32px;background:#15151a;border-radius:12px;border:1px solid #2a2a31;text-align:center}h1{margin:0 0 12px;font-size:20px}p{color:#9c9caa;line-height:1.5;margin:0 0 16px}a.button,button{display:inline-block;background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;font-family:inherit}a.button:hover,button:hover{background:#4338ca}form{margin:0}</style></head><body><div class="card">${body}</div></body></html>`;
}

function signInstallState(payload: Omit<InstallStatePayload, "tokenType">): string {
  return jwt.sign(
    { ...payload, tokenType: "slack_install" } satisfies InstallStatePayload,
    JWT_SECRET,
    { expiresIn: INSTALL_STATE_TTL_SECONDS },
  );
}

function verifyInstallState(token: string): InstallStatePayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as InstallStatePayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "slack_install" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.userId !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function readAuthenticatedUserId(req: Request): Promise<string | null> {
  const token = getRequestToken(req);
  if (!token) return null;
  const subject = await authenticateAccessToken(token);
  return subject?.userId ?? null;
}

type SlackOAuthV2Response = {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
};

async function exchangeOAuthCode(code: string): Promise<SlackOAuthV2Response> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Slack OAuth env vars not configured");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return (await response.json()) as SlackOAuthV2Response;
}

const router: RouterType = Router();

router.get("/install", async (req: Request, res: Response) => {
  const orgQuery = typeof req.query.org === "string" ? req.query.org : "";
  if (!orgQuery) {
    res.status(400).send(renderHtml("Slack install", "<h1>Missing org</h1><p>Pass <code>?org=&lt;organizationId&gt;</code>.</p>"));
    return;
  }

  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).send(renderHtml("Slack install", "<h1>Not signed in</h1><p>Sign in to Trace, then re-open this link.</p>"));
    return;
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgQuery } },
    select: { role: true },
  });
  if (!membership) {
    res.status(403).send(renderHtml("Slack install", "<h1>Not a member</h1><p>You aren't a member of this organization.</p>"));
    return;
  }
  if (membership.role !== "admin") {
    res.status(403).send(renderHtml("Slack install", "<h1>Admin required</h1><p>Only admins can install Slack apps.</p>"));
    return;
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    res.status(500).send(renderHtml("Slack install", "<h1>Not configured</h1><p>SLACK_CLIENT_ID / SLACK_REDIRECT_URI missing.</p>"));
    return;
  }

  const state = signInstallState({ organizationId: orgQuery, userId });
  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SLACK_SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  res.redirect(authorizeUrl.toString());
});

router.get("/oauth/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !stateRaw) {
    res.status(400).send(renderHtml("Slack install", "<h1>Invalid callback</h1><p>Missing code or state.</p>"));
    return;
  }
  const state = verifyInstallState(stateRaw);
  if (!state) {
    res.status(400).send(renderHtml("Slack install", "<h1>Invalid state</h1><p>The install link expired or is invalid. Restart from /slack/install.</p>"));
    return;
  }

  const oauthResult = await exchangeOAuthCode(code).catch((err: unknown) => {
    console.error("[slack] oauth exchange failed:", (err as Error).message);
    return null;
  });
  if (!oauthResult || !oauthResult.ok || !oauthResult.access_token || !oauthResult.team?.id || !oauthResult.bot_user_id) {
    res.status(400).send(renderHtml("Slack install", `<h1>OAuth failed</h1><p>${escapeHtml(oauthResult?.error ?? "Could not complete Slack install.")}</p>`));
    return;
  }

  const { encrypted, iv } = encryptSecret(oauthResult.access_token);

  await prisma.slackInstall.upsert({
    where: { slackTeamId: oauthResult.team.id },
    create: {
      slackTeamId: oauthResult.team.id,
      slackTeamName: oauthResult.team.name ?? null,
      botUserId: oauthResult.bot_user_id,
      encryptedBotToken: encrypted,
      iv,
      installedById: state.userId,
      organizationId: state.organizationId,
    },
    update: {
      slackTeamName: oauthResult.team.name ?? null,
      botUserId: oauthResult.bot_user_id,
      encryptedBotToken: encrypted,
      iv,
      installedById: state.userId,
      organizationId: state.organizationId,
    },
  });
  invalidateSlackClient(oauthResult.team.id);

  res.status(200).send(
    renderHtml(
      "Slack install",
      `<h1>✅ Installed</h1><p>Trace is connected to <b>${escapeHtml(oauthResult.team.name ?? oauthResult.team.id)}</b>. You can close this tab.</p>`,
    ),
  );
});

router.get("/link", async (req: Request, res: Response) => {
  const team = typeof req.query.team === "string" ? req.query.team : "";
  const user = typeof req.query.user === "string" ? req.query.user : "";
  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";

  const state = verifySlackLinkState(stateRaw);
  if (!state || state.slackTeamId !== team || state.slackUserId !== user) {
    res.status(400).send(renderHtml("Link Slack", "<h1>Invalid link</h1><p>This link is invalid or has expired. Mention <code>@trace</code> in Slack to get a fresh one.</p>"));
    return;
  }

  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    const webUrl = process.env.TRACE_WEB_URL?.replace(/\/$/, "") ?? "";
    const target = `${webUrl}/slack/link?team=${encodeURIComponent(team)}&user=${encodeURIComponent(user)}&state=${encodeURIComponent(stateRaw)}`;
    res.status(401).send(
      renderHtml(
        "Link Slack",
        `<h1>Sign in to Trace</h1><p>Sign in, then return to this page.</p><p><a class="button" href="${escapeHtml(webUrl || "/")}">Open Trace</a></p><p style="font-size:12px;color:#666">Return URL: <code>${escapeHtml(target)}</code></p>`,
      ),
    );
    return;
  }

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: team },
    select: { slackTeamName: true },
  });
  const teamName = install?.slackTeamName ?? team;

  res.status(200).send(
    renderHtml(
      "Link Slack",
      `<h1>Link Slack account</h1><p>Link your Trace account to <b>${escapeHtml(teamName)}</b>?</p><form method="POST" action="/slack/link/complete"><input type="hidden" name="team" value="${escapeHtml(team)}"><input type="hidden" name="user" value="${escapeHtml(user)}"><input type="hidden" name="state" value="${escapeHtml(stateRaw)}"><button type="submit">Confirm link</button></form>`,
    ),
  );
});

router.post(
  "/link/complete",
  express.urlencoded({ extended: false }),
  async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const team = typeof body?.team === "string" ? body.team : "";
    const user = typeof body?.user === "string" ? body.user : "";
    const stateRaw = typeof body?.state === "string" ? body.state : "";

    const state = verifySlackLinkState(stateRaw);
    if (!state || state.slackTeamId !== team || state.slackUserId !== user) {
      res.status(400).send(renderHtml("Link Slack", "<h1>Invalid link</h1><p>This link is invalid or has expired.</p>"));
      return;
    }

    const userId = await readAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).send(renderHtml("Link Slack", "<h1>Sign in</h1><p>Sign in to Trace and try again.</p>"));
      return;
    }

    await prisma.slackAccount.upsert({
      where: { slackUserId_slackTeamId: { slackUserId: user, slackTeamId: team } },
      create: { slackUserId: user, slackTeamId: team, userId },
      update: { userId },
    });

    const client = await getSlackClient(team);
    if (client) {
      void client.chat
        .postMessage({
          channel: user,
          text: "✅ Linked — you can now mention `@trace` to start a session.",
        })
        .catch((err: unknown) => {
          console.warn("[slack] post-link DM failed:", (err as Error).message);
        });
    }

    res.status(200).send(
      renderHtml(
        "Link Slack",
        "<h1>✅ Linked</h1><p>Your Trace account is now linked to Slack. You can close this tab.</p>",
      ),
    );
  },
);

type SlackEventEnvelope = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: SlackEventBody;
};

type SlackEventBody = {
  type?: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  team?: string;
};

function stripBotMention(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function handleAppMention(input: {
  teamId: string;
  event: SlackEventBody;
}): Promise<void> {
  const { teamId, event } = input;
  const slackUserId = event.user;
  const channel = event.channel;
  const ts = event.ts;
  const threadTs = event.thread_ts ?? event.ts;
  if (!slackUserId || !channel || !ts || !threadTs) {
    console.warn("[slack] app_mention missing required fields", { teamId, slackUserId, channel, ts, threadTs });
    return;
  }

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: teamId },
    select: { organizationId: true, botUserId: true },
  });
  if (!install) {
    console.warn("[slack] ignoring app_mention without install", { teamId, channel, threadTs });
    return;
  }

  const existingThread = await prisma.slackThreadSession.findUnique({
    where: {
      slackTeamId_slackChannelId_slackThreadTs: {
        slackTeamId: teamId,
        slackChannelId: channel,
        slackThreadTs: threadTs,
      },
    },
    select: { id: true },
  });
  if (existingThread) {
    console.info("[slack] ignoring duplicate app_mention for existing thread", { teamId, channel, threadTs });
    return;
  }

  const traceUserId = await resolveTraceUser(teamId, slackUserId);
  if (!traceUserId) {
    console.info("[slack] prompting unlinked Slack user", { teamId, slackUserId, channel, threadTs });
    await postLinkPrompt({
      slackTeamId: teamId,
      slackUserId,
      slackChannelId: channel,
      threadTs,
    });
    return;
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId: traceUserId, organizationId: install.organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    const client = await getSlackClient(teamId);
    if (client) {
      await client.chat
        .postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text: "Your Trace account isn't in this workspace's org.",
        })
        .catch(() => {});
    }
    return;
  }

  const rawText = typeof event.text === "string" ? event.text : "";
  const prompt = stripBotMention(rawText, install.botUserId);
  if (!prompt) {
    const client = await getSlackClient(teamId);
    if (client) {
      await client.chat
        .postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text: "Mention `@trace` with a prompt to start a session.",
        })
        .catch(() => {});
    }
    return;
  }

  let session: Awaited<ReturnType<typeof sessionService.start>>;
  try {
    session = await sessionService.start({
      tool: "claude_code",
      organizationId: install.organizationId,
      createdById: traceUserId,
      hosting: "cloud",
      prompt,
      actorType: "user",
      clientSource: "slack",
    });
  } catch (err: unknown) {
    const message = errorMessage(err);
    console.warn("[slack] failed to start session", { teamId, slackUserId, channel, threadTs, error: message });
    const client = await getSlackClient(teamId);
    if (client) {
      await client.chat
        .postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text: `Could not start a Trace session: ${message}`,
        })
        .catch(() => {});
    }
    return;
  }

  await prisma.slackThreadSession.create({
    data: {
      slackTeamId: teamId,
      slackChannelId: channel,
      slackThreadTs: threadTs,
      sessionId: session.id,
      organizationId: install.organizationId,
    },
  });

  slackEventBridge.attach(session.id, {
    slackTeamId: teamId,
    slackChannelId: channel,
    slackThreadTs: threadTs,
  });

  const client = await getSlackClient(teamId);
  if (client) {
    const shortId = session.id.slice(0, 8);
    await client.chat
      .postMessage({
        channel,
        thread_ts: threadTs,
        text: `🟢 Session started — \`${shortId}\``,
      })
      .catch((err: unknown) => {
        console.warn("[slack] failed to post start message:", (err as Error).message);
      });
  }
}

async function handleThreadMessage(input: {
  teamId: string;
  event: SlackEventBody;
}): Promise<void> {
  const { teamId, event } = input;
  const slackUserId = event.user;
  const channel = event.channel;
  const threadTs = event.thread_ts;
  if (!slackUserId || !channel || !threadTs) return;
  if (event.bot_id) return;
  if (event.subtype) return;

  const thread = await prisma.slackThreadSession.findUnique({
    where: {
      slackTeamId_slackChannelId_slackThreadTs: {
        slackTeamId: teamId,
        slackChannelId: channel,
        slackThreadTs: threadTs,
      },
    },
    select: { sessionId: true, organizationId: true },
  });
  if (!thread) return;

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: teamId },
    select: { botUserId: true },
  });
  if (!install) return;

  const rawText = typeof event.text === "string" ? event.text : "";
  if (rawText.includes(`<@${install.botUserId}>`)) {
    return;
  }

  const traceUserId = await resolveTraceUser(teamId, slackUserId);
  if (!traceUserId) {
    await postLinkPrompt({
      slackTeamId: teamId,
      slackUserId,
      slackChannelId: channel,
      threadTs,
    });
    return;
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId: traceUserId, organizationId: thread.organizationId } },
    select: { userId: true },
  });
  if (!membership) return;

  const text = rawText.trim();
  if (!text) return;

  await sessionService.sendMessage({
    sessionId: thread.sessionId,
    text,
    actorType: "user",
    actorId: traceUserId,
    clientSource: "slack",
  });
}

async function handleMessage(input: {
  teamId: string;
  event: SlackEventBody;
}): Promise<void> {
  const { teamId, event } = input;
  if (event.bot_id) return;
  if (event.subtype) return;

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: teamId },
    select: { botUserId: true },
  });
  const rawText = typeof event.text === "string" ? event.text : "";
  if (install && rawText.includes(`<@${install.botUserId}>`)) {
    await handleAppMention({ teamId, event });
    return;
  }

  await handleThreadMessage({ teamId, event });
}

async function handleUninstall(teamId: string): Promise<void> {
  await prisma.slackInstall.deleteMany({ where: { slackTeamId: teamId } }).catch(() => {});
  invalidateSlackClient(teamId);
}

async function dispatchSlackEvent(envelope: SlackEventEnvelope): Promise<void> {
  const teamId = envelope.team_id;
  const event = envelope.event;
  if (!teamId || !event || !event.type) return;

  if (event.type === "app_mention") {
    await handleAppMention({ teamId, event });
    return;
  }

  if (event.type === "message") {
    await handleMessage({ teamId, event });
    return;
  }

  if (event.type === "app_uninstalled" || event.type === "tokens_revoked") {
    await handleUninstall(teamId);
    return;
  }
}

router.post(
  "/events",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      res.status(500).json({ error: "SLACK_SIGNING_SECRET not configured" });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf-8")
      : typeof req.body === "string"
        ? req.body
        : "";

    const timestamp =
      typeof req.headers["x-slack-request-timestamp"] === "string"
        ? req.headers["x-slack-request-timestamp"]
        : undefined;
    const signature =
      typeof req.headers["x-slack-signature"] === "string"
        ? req.headers["x-slack-signature"]
        : undefined;

    if (!verifySlackSignature({ signingSecret, rawBody, timestamp, signature })) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    let envelope: SlackEventEnvelope;
    try {
      envelope = JSON.parse(rawBody) as SlackEventEnvelope;
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    if (envelope.type === "url_verification" && typeof envelope.challenge === "string") {
      res.status(200).type("text/plain").send(envelope.challenge);
      return;
    }

    console.info("[slack] event received", {
      teamId: envelope.team_id,
      eventType: envelope.event?.type,
      channel: envelope.event?.channel,
      user: envelope.event?.user,
    });

    res.status(200).json({ ok: true });

    setImmediate(() => {
      void dispatchSlackEvent(envelope).catch((err: unknown) => {
        console.error("[slack] event dispatch failed:", (err as Error).message);
      });
    });
  },
);

export { router as slackRouter };
