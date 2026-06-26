import { Router, type Router as RouterType, type Request, type Response } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { Prisma, type CodingTool } from "@prisma/client";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelsForTool,
  getReasoningEffortLabel,
  getReasoningEffortsForTool,
  isSupportedModel,
  isSupportedReasoningEffort,
} from "@trace/shared";
import { prisma } from "../lib/db.js";
import { encryptSecret } from "../lib/encryption.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { authenticateAccessToken, getRequestToken } from "../lib/auth.js";
import { verifySlackSignature } from "../lib/slack/signature.js";
import { getMissingSlackConfig, isSlackConfigured, slackSessionHosting } from "../lib/slack/config.js";
import { getSlackBotToken, getSlackClient, invalidateSlackClient } from "../lib/slack/client.js";
import {
  postLinkPrompt,
  resolveTraceUser,
  signSlackLinkState,
  verifySlackLinkState,
} from "../lib/slack/user-resolver.js";
import { buildTraceSessionLink, slackEventBridge } from "../lib/slack/event-bridge.js";
import {
  startSlackSession,
  type SlackSessionSettings,
} from "../lib/slack/session-orchestrator.js";
import { sessionService } from "../services/session.js";
import { sessionApplicationService } from "../services/session-applications.js";
import { sessionApplicationWorkflowService } from "../services/session-application-workflow.js";
import { runtimeAccessService } from "../services/runtime-access.js";
import { storage } from "../lib/storage/index.js";
import { sessionRouter } from "../lib/session-router.js";

const JWT_SECRET = resolveJwtSecret();
const INSTALL_STATE_TTL_SECONDS = 10 * 60;
const BIND_STATE_TTL_SECONDS = 10 * 60;
const RECENT_MENTION_TTL_MS = 30 * 1000;
const SLACK_MAX_FILE_COUNT = 4;
const SLACK_MAX_FILE_BYTES = 10 * 1024 * 1024;
const SLACK_THREAD_CONTEXT_MAX_MESSAGES = 30;
const SLACK_THREAD_CONTEXT_MAX_CHARS = 12_000;
const recentMentionKeys = new Map<string, number>();
const SLACK_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "chat:write.public",
  "commands",
  "files:read",
  "im:write",
  "users:read",
  "channels:read",
  "channels:history",
  "groups:history",
].join(",");

const SUPPORTED_TOOLS = new Set<CodingTool>(["claude_code", "codex"]);
const REASONING_ALIASES = new Map([
  ["think", "high"],
  ["thinking", "high"],
  ["max", "max"],
]);
const SUPPORTED_SLACK_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

type InstallStatePayload = {
  organizationId: string;
  userId: string;
  tokenType: "slack_install";
};

type BindStatePayload = {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId?: string;
  tokenType: "slack_bind";
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

function signBindState(payload: Omit<BindStatePayload, "tokenType">): string {
  return jwt.sign(
    { ...payload, tokenType: "slack_bind" } satisfies BindStatePayload,
    JWT_SECRET,
    { expiresIn: BIND_STATE_TTL_SECONDS },
  );
}

function verifyBindState(token: string): BindStatePayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as BindStatePayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "slack_bind" ||
      typeof payload.slackTeamId !== "string" ||
      typeof payload.slackChannelId !== "string" ||
      (payload.slackUserId !== undefined && typeof payload.slackUserId !== "string")
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

function renderSlackNotConfigured(res: Response): void {
  const missing = getMissingSlackConfig();
  res.status(503).send(
    renderHtml(
      "Slack not configured",
      `<h1>Slack not configured</h1><p>Set ${escapeHtml(missing.join(", "))} to enable Slack.</p>`,
    ),
  );
}

function isSupportedTool(value: string): value is CodingTool {
  return SUPPORTED_TOOLS.has(value as CodingTool);
}

function normalizeTool(value: string | null | undefined): CodingTool | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  return isSupportedTool(normalized) ? normalized : null;
}

function normalizeModelAlias(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "opus") return "claude-opus-4-8[1m]";
  if (normalized === "sonnet") return "claude-sonnet-4-6";
  if (normalized === "haiku") return "claude-haiku-4-5";
  return value.trim();
}

function normalizeReasoningAlias(value: string): string {
  const normalized = value.trim().toLowerCase();
  return REASONING_ALIASES.get(normalized) ?? normalized;
}

function formSelect(
  name: string,
  label: string,
  value: string | null | undefined,
  options: readonly { value: string; label: string }[],
): string {
  const renderedOptions = options
    .map((option) => {
      const selected = option.value === value ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join("");
  return `<label style="display:block;text-align:left;margin:12px 0;color:#c7c7d1">${escapeHtml(label)}<select name="${escapeHtml(name)}" style="display:block;width:100%;margin-top:6px;background:#0b0b0e;color:#e6e6ea;border:1px solid #2a2a31;border-radius:8px;padding:10px">${renderedOptions}</select></label>`;
}

function defaultToolOptions(): { value: string; label: string }[] {
  return [
    { value: "claude_code", label: "Claude Code" },
    { value: "codex", label: "Codex" },
  ];
}

function modelOptionsFor(tool: CodingTool): { value: string; label: string }[] {
  return getModelsForTool(tool).map((option) => ({ value: option.value, label: option.label }));
}

function reasoningOptionsFor(tool: CodingTool): { value: string; label: string }[] {
  return getReasoningEffortsForTool(tool).map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

function validateSlackSessionConfig(input: {
  tool: CodingTool;
  model?: string | null;
  reasoningEffort?: string | null;
}): { tool: CodingTool; model: string | null; reasoningEffort: string | null } {
  const model = input.model ? normalizeModelAlias(input.model) : null;
  const reasoningEffort = input.reasoningEffort
    ? normalizeReasoningAlias(input.reasoningEffort)
    : null;

  if (model && !isSupportedModel(input.tool, model)) {
    throw new Error(`Unsupported model "${model}" for ${input.tool}`);
  }
  if (reasoningEffort && !isSupportedReasoningEffort(input.tool, reasoningEffort)) {
    throw new Error(`Unsupported thinking level "${reasoningEffort}" for ${input.tool}`);
  }

  return { tool: input.tool, model, reasoningEffort };
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
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

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

  const clientId = process.env.SLACK_CLIENT_ID!;
  const redirectUri = process.env.SLACK_REDIRECT_URI!;

  const state = signInstallState({ organizationId: orgQuery, userId });
  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SLACK_SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  res.redirect(authorizeUrl.toString());
});

router.get("/oauth/callback", async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

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
  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: state.userId,
        organizationId: state.organizationId,
      },
    },
    select: { role: true },
  });
  if (!membership || membership.role !== "admin") {
    res.status(403).send(renderHtml("Slack install", "<h1>Admin required</h1><p>Only current org admins can complete Slack installs.</p>"));
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
      `<h1>Installed</h1><p>Trace is connected to <b>${escapeHtml(oauthResult.team.name ?? oauthResult.team.id)}</b>.</p><p>Add Trace to a Slack channel, then bind that Slack channel to a Trace channel.</p>`,
    ),
  );
});

router.get("/link", async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

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
      `<h1>Link Slack account</h1><p>Link your Trace account to <b>${escapeHtml(teamName)}</b>. Session settings are chosen when you start a session from Slack.</p><form method="POST" action="/slack/link/complete"><input type="hidden" name="team" value="${escapeHtml(team)}"><input type="hidden" name="user" value="${escapeHtml(user)}"><input type="hidden" name="state" value="${escapeHtml(stateRaw)}"><button type="submit">Link account</button></form>`,
    ),
  );
});

router.post(
  "/link/complete",
  express.urlencoded({ extended: false }),
  async (req: Request, res: Response) => {
    if (!isSlackConfigured()) {
      renderSlackNotConfigured(res);
      return;
    }

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
      create: {
        slackUserId: user,
        slackTeamId: team,
        userId,
      },
      update: {
        userId,
      },
    });

    const client = await getSlackClient(team);
    if (client) {
      void client.chat
        .postMessage({
          channel: user,
          text: "Linked. You can now mention `@trace` to start a session.",
        })
        .catch((err: unknown) => {
          console.warn("[slack] post-link DM failed:", (err as Error).message);
        });
    }

    res.status(200).send(
      renderHtml(
        "Link Slack",
        "<h1>Linked</h1><p>Your Trace account is now linked to Slack. You can close this tab.</p>",
      ),
    );
  },
);

router.get("/preferences", async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

  res.status(200).send(
    renderHtml(
      "Slack settings",
      "<h1>No Slack defaults</h1><p>Choose tool, model, thinking, and hosting when you start each Trace session from Slack.</p>",
    ),
  );
});

router.post("/preferences", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

  res.status(410).send(
    renderHtml(
      "Slack settings",
      "<h1>No Slack defaults</h1><p>Slack session settings are chosen when each session starts.</p>",
    ),
  );
});

router.get("/bind-channel", async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

  const team = typeof req.query.team === "string" ? req.query.team : "";
  const channel = typeof req.query.channel === "string" ? req.query.channel : "";
  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
  const state = verifyBindState(stateRaw);
  if (!state || state.slackTeamId !== team || state.slackChannelId !== channel) {
    res.status(400).send(renderHtml("Bind Slack channel", "<h1>Invalid link</h1><p>This binding link is invalid or expired.</p>"));
    return;
  }

  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    const webUrl = process.env.TRACE_WEB_URL?.replace(/\/$/, "") ?? "/";
    res.status(401).send(renderHtml("Bind Slack channel", `<h1>Sign in to Trace</h1><p>Sign in, then return to this page.</p><p><a class="button" href="${escapeHtml(webUrl)}">Open Trace</a></p>`));
    return;
  }

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: team },
    select: { organizationId: true, slackTeamName: true },
  });
  if (!install) {
    res.status(404).send(renderHtml("Bind Slack channel", "<h1>Slack not installed</h1><p>Install Slack for this Trace org first.</p>"));
    return;
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId: install.organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    res.status(403).send(renderHtml("Bind Slack channel", "<h1>Not a member</h1><p>Your Trace account is not in this workspace's org.</p>"));
    return;
  }
  if (state.slackUserId) {
    const account = await resolveSlackAccount(team, state.slackUserId);
    if (!account || account.userId !== userId) {
      res.status(403).send(renderBindRequiresLinkedAccount(team, state.slackUserId));
      return;
    }
  }

  const channels = await prisma.channel.findMany({
    where: {
      organizationId: install.organizationId,
    },
    select: { id: true, name: true, type: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    take: 100,
  });
  if (channels.length === 0) {
    res.status(403).send(renderHtml("Bind Slack channel", "<h1>No Trace channels</h1><p>Join or create a Trace channel first.</p>"));
    return;
  }

  const existing = await resolveSlackChannelBinding(team, channel);
  const options = channels.map((traceChannel) => ({
    value: traceChannel.id,
    label: `${traceChannel.name} (${traceChannel.type})`,
  }));

  res.status(200).send(
    renderHtml(
      "Bind Slack channel",
      `<h1>Bind Slack channel</h1><p>Choose the Trace channel that sessions from this Slack channel should use.</p><form method="POST" action="/slack/bind-channel"><input type="hidden" name="team" value="${escapeHtml(team)}"><input type="hidden" name="channel" value="${escapeHtml(channel)}"><input type="hidden" name="state" value="${escapeHtml(stateRaw)}">${formSelect("traceChannelId", "Trace channel", existing?.traceChannelId ?? channels[0]!.id, options)}<button type="submit">Bind channel</button></form>`,
    ),
  );
});

router.post("/bind-channel", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

  const body = req.body as Record<string, unknown>;
  const team = typeof body.team === "string" ? body.team : "";
  const channel = typeof body.channel === "string" ? body.channel : "";
  const stateRaw = typeof body.state === "string" ? body.state : "";
  const traceChannelId = typeof body.traceChannelId === "string" ? body.traceChannelId : "";
  const state = verifyBindState(stateRaw);
  if (!state || state.slackTeamId !== team || state.slackChannelId !== channel) {
    res.status(400).send(renderHtml("Bind Slack channel", "<h1>Invalid link</h1><p>This binding link is invalid or expired.</p>"));
    return;
  }

  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).send(renderHtml("Bind Slack channel", "<h1>Sign in</h1><p>Sign in to Trace and try again.</p>"));
    return;
  }
  if (state.slackUserId) {
    const account = await resolveSlackAccount(team, state.slackUserId);
    if (!account || account.userId !== userId) {
      res.status(403).send(renderBindRequiresLinkedAccount(team, state.slackUserId));
      return;
    }
  }

  try {
    await bindSlackChannel({
      slackTeamId: team,
      slackChannelId: channel,
      traceChannelId,
      boundById: userId,
    });
  } catch (err: unknown) {
    res.status(400).send(renderHtml("Bind Slack channel", `<h1>Could not bind channel</h1><p>${escapeHtml(errorMessage(err))}</p>`));
    return;
  }

  const client = await getSlackClient(team);
  if (client) {
    await client.chat
      .postMessage({
        channel,
        text: "This Slack channel is now bound to a Trace channel.",
      })
      .catch(() => {});
  }

  res.status(200).send(renderHtml("Bind Slack channel", "<h1>Bound</h1><p>This Slack channel is now bound to Trace.</p>"));
});

router.get("/settings", async (req: Request, res: Response) => {
  const organizationId = typeof req.query.org === "string" ? req.query.org : "";
  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!organizationId) {
    res.status(400).json({ error: "Missing org" });
    return;
  }
  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  });
  if (!membership) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  const install = await prisma.slackInstall.findFirst({
    where: { organizationId },
    select: { slackTeamId: true, slackTeamName: true, createdAt: true },
  });
  const bindings = install
    ? await prisma.slackChannelBinding.findMany({
        where: { organizationId },
        select: {
          id: true,
          slackTeamId: true,
          slackChannelId: true,
          traceChannel: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({
    configured: isSlackConfigured(),
    missingConfig: getMissingSlackConfig(),
    canInstall: membership.role === "admin",
    install,
    bindings,
  });
});

router.delete("/install", async (req: Request, res: Response) => {
  const organizationId = typeof req.query.org === "string" ? req.query.org : "";
  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!organizationId) {
    res.status(400).json({ error: "Missing org" });
    return;
  }
  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  });
  if (!membership || membership.role !== "admin") {
    res.status(403).json({ error: "Org admin required" });
    return;
  }

  const installs = await prisma.slackInstall.findMany({
    where: { organizationId },
    select: { slackTeamId: true },
  });
  const teamIds = installs.map((install) => install.slackTeamId);
  if (teamIds.length === 0) {
    res.json({ disconnected: false });
    return;
  }

  await disconnectSlackTeams(teamIds, organizationId);
  res.json({ disconnected: true });
});

type SlackEventEnvelope = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event_id?: string;
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
  app_id?: string;
  username?: string;
  subtype?: string;
  team?: string;
  channel_type?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  files?: unknown[];
};

type SlackEventFile = {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
};

type SlackThreadReply = {
  user?: string;
  username?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  attachments?: unknown[];
};

type SlackStoredFileRef = {
  key: string;
  kind: "image";
  mimeType: string;
  name: string;
  size: number;
  slackFileId: string | null;
};

type SlackFileIngestionResult = {
  refs: SlackStoredFileRef[];
  warnings: string[];
};

type SlackCommandBody = {
  team_id?: string;
  channel_id?: string;
  user_id?: string;
  trigger_id?: string;
  text?: string;
};

type SlackInteractionPayload = {
  type?: string;
  user?: { id?: string };
  team?: { id?: string };
  channel?: { id?: string };
  response_url?: string;
  trigger_id?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: Record<string, Record<string, { value?: string; selected_option?: { value?: string } }>>;
    };
  };
};

type AdvancedStartMetadata = {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
  draftId?: string;
};

type SlackBridgeAccessRequestValue = {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  requesterSlackUserId: string;
};

type SlackBridgeAccessApproveValue = SlackBridgeAccessRequestValue & {
  requestId: string;
};

function stripBotMention(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function normalizeContentType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().split(";")[0]?.trim();
  return normalized || null;
}

function sanitizeSlackFilename(value: string | undefined): string {
  const fallback = "slack-image";
  const trimmed = value?.trim() || fallback;
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "") || fallback;
  return sanitized.slice(0, 100);
}

function asSlackFiles(files: unknown[] | undefined): SlackEventFile[] {
  if (!Array.isArray(files)) return [];
  return files.filter((file): file is SlackEventFile => {
    return !!file && typeof file === "object" && !Array.isArray(file);
  });
}

function parseSlackFileRefs(value: unknown): SlackStoredFileRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SlackStoredFileRef => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const ref = entry as Record<string, unknown>;
    return (
      ref.kind === "image" &&
      typeof ref.key === "string" &&
      typeof ref.mimeType === "string" &&
      typeof ref.name === "string" &&
      typeof ref.size === "number"
    );
  });
}

function imageKeysFromFileRefs(refs: SlackStoredFileRef[]): string[] {
  return refs.filter((ref) => ref.kind === "image").map((ref) => ref.key);
}

function fallbackPromptForImages(imageKeys: string[]): string {
  return imageKeys.length > 0 ? "Please analyze the attached image." : "";
}

function selectedFilesSummary(refs: SlackStoredFileRef[], warnings: string[]): string {
  const parts: string[] = [];
  if (refs.length === 1) parts.push("1 image attached");
  if (refs.length > 1) parts.push(`${refs.length} images attached`);
  if (warnings.length > 0) parts.push(warnings.join(" "));
  return parts.join(" ");
}

async function uploadSlackFile(input: {
  slackTeamId: string;
  organizationId: string;
  file: SlackEventFile;
  contentType: string;
}): Promise<SlackStoredFileRef> {
  const token = await getSlackBotToken(input.slackTeamId);
  if (!token) throw new Error("Slack install token not found");

  const url = input.file.url_private_download ?? input.file.url_private;
  if (!url) throw new Error("Slack file download URL is missing");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Slack file download failed with HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const body = Buffer.from(arrayBuffer);
  if (body.length > SLACK_MAX_FILE_BYTES) {
    throw new Error("Slack file is too large");
  }

  const filename = sanitizeSlackFilename(input.file.name ?? input.file.title);
  const key = `uploads/${input.organizationId}/${randomUUID()}-${filename}`;
  await storage.putObject(key, body, input.contentType);
  return {
    key,
    kind: "image",
    mimeType: input.contentType,
    name: filename,
    size: body.length,
    slackFileId: input.file.id ?? null,
  };
}

async function ingestSlackFiles(input: {
  slackTeamId: string;
  organizationId: string;
  files: unknown[] | undefined;
}): Promise<SlackFileIngestionResult> {
  const files = asSlackFiles(input.files);
  if (files.length === 0) return { refs: [], warnings: [] };

  const warnings: string[] = [];
  const refs: SlackStoredFileRef[] = [];
  for (const file of files.slice(0, SLACK_MAX_FILE_COUNT)) {
    const contentType = normalizeContentType(file.mimetype);
    if (!contentType || !SUPPORTED_SLACK_IMAGE_MIME_TYPES.has(contentType)) {
      warnings.push(`Unsupported file skipped: ${file.name ?? file.title ?? file.id ?? "file"}.`);
      continue;
    }
    if (typeof file.size === "number" && file.size > SLACK_MAX_FILE_BYTES) {
      warnings.push(`File too large skipped: ${file.name ?? file.title ?? file.id ?? "file"}.`);
      continue;
    }
    try {
      refs.push(
        await uploadSlackFile({
          slackTeamId: input.slackTeamId,
          organizationId: input.organizationId,
          file,
          contentType,
        }),
      );
    } catch (err: unknown) {
      warnings.push(`Could not read ${file.name ?? file.title ?? file.id ?? "a Slack file"}.`);
      console.warn("[slack] failed to ingest Slack file:", errorMessage(err));
    }
  }

  if (files.length > SLACK_MAX_FILE_COUNT) {
    warnings.push(`Only the first ${SLACK_MAX_FILE_COUNT} files were considered.`);
  }
  return { refs, warnings };
}

type ParsedSlackPrompt = {
  prompt: string;
  tool?: CodingTool;
  model?: string;
  reasoningEffort?: string;
  hosting?: "cloud" | "local";
  yolo?: boolean;
};

function parseSlackPrompt(text: string): ParsedSlackPrompt {
  const tokens = text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const promptParts: string[] = [];
  const result: ParsedSlackPrompt = { prompt: "" };

  const clean = (value: string) => value.replace(/^["']|["']$/g, "");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const readValue = () => {
      const inline = token.includes("=") ? token.slice(token.indexOf("=") + 1) : null;
      if (inline !== null) return clean(inline);
      i += 1;
      return clean(tokens[i] ?? "");
    };

    if (token === "--model" || token.startsWith("--model=")) {
      const value = readValue();
      if (value) result.model = normalizeModelAlias(value);
      continue;
    }
    if (token === "--think" || token === "--thinking" || token.startsWith("--think=") || token.startsWith("--thinking=")) {
      const value = readValue();
      if (value) result.reasoningEffort = normalizeReasoningAlias(value);
      continue;
    }
    if (token === "--tool" || token.startsWith("--tool=")) {
      const value = readValue();
      const tool = normalizeTool(value);
      if (tool) result.tool = tool;
      continue;
    }
    if (token === "--hosting" || token.startsWith("--hosting=")) {
      const value = readValue();
      if (value === "local" || value === "cloud") result.hosting = value;
      continue;
    }
    promptParts.push(clean(token));
  }

  if (promptParts.length > 0 && promptParts[promptParts.length - 1]!.toLowerCase() === "yolo") {
    result.yolo = true;
    promptParts.pop();
  }

  result.prompt = promptParts.join(" ").trim();
  return result;
}

function slackTsValue(ts: string | undefined): number | null {
  if (!ts) return null;
  const value = Number(ts);
  return Number.isFinite(value) ? value : null;
}

function asSlackThreadReplies(value: unknown): SlackThreadReply[] {
  if (!Array.isArray(value)) return [];
  return value.filter((reply): reply is SlackThreadReply => {
    return !!reply && typeof reply === "object" && !Array.isArray(reply);
  });
}

function slackAttachmentText(attachments: unknown[] | undefined): string {
  if (!Array.isArray(attachments)) return "";
  return attachments
    .map((attachment) => {
      const item = getObject(attachment);
      if (!item) return "";
      return ["pretext", "title", "text", "fallback"]
        .map((key) => {
          const value = item[key];
          return typeof value === "string" ? value.trim() : "";
        })
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function slackReplyAuthor(reply: SlackThreadReply): string {
  if (reply.user) return `<@${reply.user}>`;
  if (reply.username?.trim()) return reply.username.trim();
  if (reply.bot_id) return `bot:${reply.bot_id}`;
  return "Slack";
}

function slackReplyBody(reply: SlackThreadReply, botUserId: string): string {
  const text = typeof reply.text === "string" ? stripBotMention(reply.text, botUserId) : "";
  return [text.trim(), slackAttachmentText(reply.attachments)].filter(Boolean).join("\n").trim();
}

function truncateSlackThreadContext(text: string): string {
  if (text.length <= SLACK_THREAD_CONTEXT_MAX_CHARS) return text;
  return `${text.slice(0, SLACK_THREAD_CONTEXT_MAX_CHARS - 1)}…`;
}

function formatSlackThreadContext(input: {
  replies: SlackThreadReply[];
  mentionTs: string;
  botUserId: string;
}): string {
  const mentionTsValue = slackTsValue(input.mentionTs);
  if (mentionTsValue === null) return "";

  const lines = input.replies
    .filter((reply) => {
      const ts = slackTsValue(reply.ts);
      return ts !== null && ts < mentionTsValue;
    })
    .sort((a, b) => (slackTsValue(a.ts) ?? 0) - (slackTsValue(b.ts) ?? 0))
    .slice(-SLACK_THREAD_CONTEXT_MAX_MESSAGES)
    .map((reply) => {
      const body = slackReplyBody(reply, input.botUserId);
      return body ? `${slackReplyAuthor(reply)}: ${body}` : "";
    })
    .filter(Boolean);

  return truncateSlackThreadContext(lines.join("\n\n"));
}

async function loadSlackThreadContext(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  mentionTs: string;
  botUserId: string;
}): Promise<string> {
  if (input.slackThreadTs === input.mentionTs) return "";

  const client = await getSlackClient(input.slackTeamId);
  if (!client) return "";
  const response = await client.conversations
    .replies({
      channel: input.slackChannelId,
      ts: input.slackThreadTs,
      limit: SLACK_THREAD_CONTEXT_MAX_MESSAGES + 1,
      inclusive: true,
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to load thread context:", errorMessage(err));
      return null;
    });
  const responseObject = getObject(response);
  return formatSlackThreadContext({
    replies: asSlackThreadReplies(responseObject?.messages),
    mentionTs: input.mentionTs,
    botUserId: input.botUserId,
  });
}

function promptWithSlackThreadContext(input: {
  prompt: string;
  threadContext: string;
}): string {
  const context = input.threadContext.trim();
  if (!context) return input.prompt;

  const request =
    input.prompt.trim() ||
    "Use the Slack thread context above to investigate and fix the issue.";
  return [
    "Slack thread context before this @trace mention:",
    context,
    "User request:",
    request,
  ].join("\n\n");
}

async function resolveSlackAccount(slackTeamId: string, slackUserId: string) {
  return prisma.slackAccount.findUnique({
    where: { slackUserId_slackTeamId: { slackUserId, slackTeamId } },
    select: {
      userId: true,
    },
  });
}

async function resolveSlackChannelBinding(slackTeamId: string, slackChannelId: string) {
  return prisma.slackChannelBinding.findUnique({
    where: {
      slackTeamId_slackChannelId: {
        slackTeamId,
        slackChannelId,
      },
    },
    select: { traceChannelId: true, organizationId: true },
  });
}

async function bindSlackChannel(input: {
  slackTeamId: string;
  slackChannelId: string;
  traceChannelId: string;
  boundById: string;
}) {
  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: input.slackTeamId },
    select: { organizationId: true },
  });
  if (!install) throw new Error("Slack is not installed for this workspace");

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId: input.boundById, organizationId: install.organizationId } },
    select: { role: true },
  });
  if (!membership) throw new Error("Your Trace account is not in this workspace's org");

  const channel = await prisma.channel.findFirst({
    where: {
      id: input.traceChannelId,
      organizationId: install.organizationId,
    },
    select: { id: true },
  });
  if (!channel) throw new Error("Trace channel not found in this organization");

  return prisma.slackChannelBinding.upsert({
    where: {
      slackTeamId_slackChannelId: {
        slackTeamId: input.slackTeamId,
        slackChannelId: input.slackChannelId,
      },
    },
    create: {
      slackTeamId: input.slackTeamId,
      slackChannelId: input.slackChannelId,
      traceChannelId: input.traceChannelId,
      organizationId: install.organizationId,
      boundById: input.boundById,
    },
    update: {
      traceChannelId: input.traceChannelId,
      organizationId: install.organizationId,
      boundById: input.boundById,
    },
  });
}

function buildBindUrl(slackTeamId: string, slackChannelId: string, slackUserId?: string): string {
  const base = process.env.TRACE_WEB_URL?.replace(/\/$/, "") ?? "";
  const state = signBindState({ slackTeamId, slackChannelId, slackUserId });
  const params = new URLSearchParams({
    team: slackTeamId,
    channel: slackChannelId,
    state,
  });
  if (slackUserId) params.set("user", slackUserId);
  return `${base}/slack/bind-channel?${params.toString()}`;
}

function buildAccountLinkUrl(slackTeamId: string, slackUserId: string): string {
  const base = process.env.TRACE_WEB_URL?.replace(/\/$/, "") ?? "";
  const state = signSlackLinkState({ slackTeamId, slackUserId });
  const params = new URLSearchParams({
    team: slackTeamId,
    user: slackUserId,
    state,
  });
  return `${base}/slack/link?${params.toString()}`;
}

async function postDirectMessageLinkPrompt(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  const linkUrl = buildAccountLinkUrl(input.slackTeamId, input.slackUserId);
  await client.chat
    .postMessage({
      channel: input.slackChannelId,
      text: `Link your Trace account to use Trace from Slack: ${linkUrl}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Link your Trace account to use Trace from Slack.",
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
      ],
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to post DM link prompt:", errorMessage(err));
    });
}

async function postDirectMessageUsage(input: {
  slackTeamId: string;
  slackChannelId: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  await client.chat
    .postMessage({
      channel: input.slackChannelId,
      text: "You're linked. Add Trace to a Slack channel, bind that channel to Trace, then mention `@trace <prompt>` there. You can also use `/trace start` in a bound channel.",
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to post DM usage prompt:", errorMessage(err));
    });
}

async function createSlackSessionDraft(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  slackUserId: string;
  organizationId: string;
  traceChannelId: string | null;
  prompt: string;
  fileRefs: SlackStoredFileRef[];
}): Promise<string> {
  const draft = await prisma.slackSessionDraft.create({
    data: {
      slackTeamId: input.slackTeamId,
      slackChannelId: input.slackChannelId,
      slackThreadTs: input.slackThreadTs,
      slackUserId: input.slackUserId,
      organizationId: input.organizationId,
      traceChannelId: input.traceChannelId,
      prompt: input.prompt,
      fileRefs: input.fileRefs as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return draft.id;
}

async function loadSlackSessionDraft(draftId: string, slackUserId?: string | null) {
  const draft = await prisma.slackSessionDraft.findUnique({
    where: { id: draftId },
  });
  if (!draft) return null;
  if (slackUserId && draft.slackUserId !== slackUserId) return null;
  return draft;
}

async function deleteSlackSessionDraft(draftId: string): Promise<void> {
  await prisma.slackSessionDraft.delete({ where: { id: draftId } }).catch(() => {});
}

async function postStartDraftPrompt(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  slackUserId: string;
  draftId: string;
  prompt: string;
  fileRefs: SlackStoredFileRef[];
  warnings: string[];
  settingsSummary?: string | null;
}): Promise<boolean> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return false;

  const summary = selectedFilesSummary(input.fileRefs, input.warnings);
  const detailText = [input.settingsSummary, summary].filter(Boolean).join("\n\n");
  return client.chat
    .postMessage({
      channel: input.slackChannelId,
      ...(input.slackThreadTs ? { thread_ts: input.slackThreadTs } : {}),
      text: "Start Trace session",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Start Trace session*${detailText ? `\n\n${detailText}` : ""}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Start" },
              style: "primary",
              action_id: "trace_start_draft",
              value: input.draftId,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Configure" },
              action_id: "trace_configure_draft",
              value: input.draftId,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Cancel" },
              action_id: "trace_cancel_draft",
              value: input.draftId,
            },
          ],
        },
      ],
    })
    .then(() => true)
    .catch((err: unknown) => {
      console.warn("[slack] failed to post session draft prompt:", errorMessage(err));
      return false;
    });
}

function encodeSlackBridgeAccessRequestValue(value: SlackBridgeAccessRequestValue): string {
  return JSON.stringify(value);
}

function encodeSlackBridgeAccessApproveValue(value: SlackBridgeAccessApproveValue): string {
  return JSON.stringify(value);
}

function decodeSlackBridgeAccessRequestValue(
  value: string | undefined,
): SlackBridgeAccessRequestValue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SlackBridgeAccessRequestValue>;
    if (
      typeof parsed.slackTeamId !== "string" ||
      typeof parsed.slackChannelId !== "string" ||
      typeof parsed.slackThreadTs !== "string" ||
      typeof parsed.requesterSlackUserId !== "string"
    ) {
      return null;
    }
    return {
      slackTeamId: parsed.slackTeamId,
      slackChannelId: parsed.slackChannelId,
      slackThreadTs: parsed.slackThreadTs,
      requesterSlackUserId: parsed.requesterSlackUserId,
    };
  } catch {
    return null;
  }
}

function decodeSlackBridgeAccessApproveValue(
  value: string | undefined,
): SlackBridgeAccessApproveValue | null {
  const request = decodeSlackBridgeAccessRequestValue(value);
  if (!request || !value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SlackBridgeAccessApproveValue>;
    if (typeof parsed.requestId !== "string") return null;
    return { ...request, requestId: parsed.requestId };
  } catch {
    return null;
  }
}

function connectionRuntimeInstanceId(connection: unknown): string | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  const runtimeInstanceId = (connection as Record<string, unknown>).runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

function renderBindRequiresLinkedAccount(slackTeamId: string, slackUserId: string): string {
  const linkUrl = buildAccountLinkUrl(slackTeamId, slackUserId);
  return renderHtml(
    "Bind Slack channel",
    `<h1>Link Slack first</h1><p>Connect this Slack user to your Trace account before binding the channel.</p><p><a class="button" href="${escapeHtml(linkUrl)}">Link Slack account</a></p>`,
  );
}

async function postBindPrompt(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId?: string;
  threadTs?: string;
  text?: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  const bindUrl = buildBindUrl(input.slackTeamId, input.slackChannelId, input.slackUserId);
  const text = input.text ?? "This Slack channel is not bound to Trace yet.";
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text } },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Bind channel" },
          url: bindUrl,
          action_id: "slack_bind_channel_open",
        },
      ],
    },
  ];

  await client.chat
    .postMessage({
      channel: input.slackChannelId,
      ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
      text,
      blocks,
    })
    .catch((err: unknown) => console.warn("[slack] failed to post bind prompt:", errorMessage(err)));
}

async function postSessionAccessRequestPrompt(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  requesterSlackUserId: string;
  runtimeLabel: string | null;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  const value = encodeSlackBridgeAccessRequestValue({
    slackTeamId: input.slackTeamId,
    slackChannelId: input.slackChannelId,
    slackThreadTs: input.slackThreadTs,
    requesterSlackUserId: input.requesterSlackUserId,
  });
  const runtime = input.runtimeLabel ? ` on ${input.runtimeLabel}` : "";
  await client.chat
    .postEphemeral({
      channel: input.slackChannelId,
      user: input.requesterSlackUserId,
      thread_ts: input.slackThreadTs,
      text: "This session is running on a local bridge. Request bridge access to reply from Slack.",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `This session is running${runtime}. Request bridge access to reply from Slack.`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Request bridge access" },
              action_id: "trace_bridge_access_request",
              value,
            },
          ],
        },
      ],
    })
    .catch(() => {});
}

async function postSessionAccessRequestFeedback(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  requesterSlackUserId: string;
  text: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  await client.chat
    .postEphemeral({
      channel: input.slackChannelId,
      user: input.requesterSlackUserId,
      thread_ts: input.slackThreadTs,
      text: input.text,
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to post session access feedback:", errorMessage(err));
    });
}

async function postThreadNotice(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  text: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  await client.chat
    .postMessage({
      channel: input.slackChannelId,
      thread_ts: input.slackThreadTs,
      text: input.text,
      mrkdwn: true,
      reply_broadcast: false,
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to post thread notice:", errorMessage(err));
    });
}

async function postDraftActionFeedback(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
  text: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  await client.chat
    .postEphemeral({
      channel: input.slackChannelId,
      user: input.slackUserId,
      text: input.text,
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to post draft action feedback:", errorMessage(err));
    });
}

async function postMentionFeedback(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
  threadTs: string;
  text: string;
}): Promise<void> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return;
  await client.chat
    .postEphemeral({
      channel: input.slackChannelId,
      user: input.slackUserId,
      thread_ts: input.threadTs,
      text: input.text,
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to post mention feedback:", errorMessage(err));
    });
}

async function postDraftUnavailableOrOwnerFeedback(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
  draftId: string;
  unavailableText?: string;
}): Promise<void> {
  const draft = await loadSlackSessionDraft(input.draftId);
  const text =
    draft && draft.slackUserId !== input.slackUserId
      ? "Only the person who created this Trace start prompt can use this button."
      : input.unavailableText ?? "This Trace start prompt is no longer available. Mention `@trace` again.";
  await postDraftActionFeedback({
    slackTeamId: input.slackTeamId,
    slackChannelId: input.slackChannelId,
    slackUserId: input.slackUserId,
    text,
  });
}

function readSignedRawBody(req: Request, res: Response): string | null {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    res.status(503).json({ error: "Slack not configured" });
    return null;
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
    return null;
  }
  return rawBody;
}

function getViewValue(
  payload: SlackInteractionPayload,
  blockId: string,
  actionId: string,
): string | null {
  const value = payload.view?.state?.values?.[blockId]?.[actionId];
  return value?.value ?? value?.selected_option?.value ?? null;
}

function slackSelectOptions(options: readonly { value: string; label: string }[]) {
  return options.slice(0, 100).map((option) => ({
    text: { type: "plain_text" as const, text: option.label.slice(0, 75) },
    value: option.value,
  }));
}

function allModelOptions(): { value: string; label: string }[] {
  const options = new Map<string, string>();
  for (const tool of defaultToolOptions()) {
    for (const model of modelOptionsFor(tool.value as CodingTool)) {
      options.set(model.value, `${tool.label}: ${model.label}`);
    }
  }
  return Array.from(options, ([value, label]) => ({ value, label }));
}

function allReasoningOptions(): { value: string; label: string }[] {
  const options = new Map<string, string>();
  for (const tool of defaultToolOptions()) {
    for (const effort of reasoningOptionsFor(tool.value as CodingTool)) {
      options.set(effort.value, getReasoningEffortLabel(effort.value));
    }
  }
  return Array.from(options, ([value, label]) => ({ value, label }));
}

async function getTraceDefaults(userId: string): Promise<{
  tool: CodingTool;
  model: string;
  reasoningEffort: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      defaultSessionTool: true,
      defaultSessionModel: true,
      defaultSessionReasoningEffort: true,
    },
  });
  const tool = user?.defaultSessionTool ?? "claude_code";
  return {
    tool,
    model:
      resolveStoredModelForToolForSlack(tool, user?.defaultSessionModel) ??
      getDefaultModel(tool) ??
      "",
    reasoningEffort:
      resolveStoredReasoningForToolForSlack(tool, user?.defaultSessionReasoningEffort) ??
      getDefaultReasoningEffort(tool) ??
      "",
  };
}

function resolveStoredModelForToolForSlack(tool: CodingTool, model?: string | null): string | null {
  return model && isSupportedModel(tool, model) ? model : null;
}

function resolveStoredReasoningForToolForSlack(
  tool: CodingTool,
  reasoningEffort?: string | null,
): string | null {
  return reasoningEffort && isSupportedReasoningEffort(tool, reasoningEffort)
    ? reasoningEffort
    : null;
}

function toolLabelForSlack(tool: CodingTool): string {
  return defaultToolOptions().find((option) => option.value === tool)?.label ?? tool;
}

function modelLabelForSlack(tool: CodingTool, model: string | null): string {
  if (!model) return "Default";
  return modelOptionsFor(tool).find((option) => option.value === model)?.label ?? model;
}

function reasoningLabelForSlack(reasoningEffort: string | null): string {
  return reasoningEffort ? getReasoningEffortLabel(reasoningEffort) : "Default";
}

async function listOrgTraceChannels(input: {
  organizationId: string;
}): Promise<Array<{ id: string; name: string; type: string }>> {
  return prisma.channel.findMany({
    where: {
      organizationId: input.organizationId,
    },
    select: { id: true, name: true, type: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    take: 100,
  });
}

async function listCloudEnvironmentOptions(organizationId: string) {
  return prisma.agentEnvironment.findMany({
    where: { organizationId, adapterType: "provisioned", enabled: true },
    select: { id: true, name: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    take: 99,
  });
}

async function listAccessibleLocalRuntimeOptions(input: {
  organizationId: string;
  userId: string;
  tool?: CodingTool | null;
}) {
  const accessibleIds = await runtimeAccessService.listAccessibleRuntimeInstanceIds({
    userId: input.userId,
    organizationId: input.organizationId,
  });
  return sessionRouter
    .listRuntimes({ hostingMode: "local" })
    .filter((runtime) => runtime.organizationId === input.organizationId)
    .filter((runtime) => accessibleIds.has(runtime.id))
    .filter((runtime) => !input.tool || runtime.supportedTools.includes(input.tool))
    .map((runtime) => ({ id: runtime.id, label: runtime.label }));
}

async function openAdvancedStartModal(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
  triggerId: string;
  draftId?: string;
}): Promise<boolean> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return false;
  const account = await resolveSlackAccount(input.slackTeamId, input.slackUserId);
  if (!account) return false;
  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: input.slackTeamId },
    select: { organizationId: true },
  });
  if (!install) return false;
  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: account.userId,
        organizationId: install.organizationId,
      },
    },
    select: { userId: true },
  });
  if (!membership) return false;
  const binding = await resolveSlackChannelBinding(input.slackTeamId, input.slackChannelId);
  if (!binding || binding.organizationId !== install.organizationId) return false;
  const draft = input.draftId
    ? await loadSlackSessionDraft(input.draftId, input.slackUserId)
    : null;
  if (input.draftId && !draft) return false;
  const defaults = await getTraceDefaults(account.userId);
  const selectedTool = defaults.tool;
  const selectedModel = defaults.model;
  const selectedReasoning = defaults.reasoningEffort;
  const fileRefs = parseSlackFileRefs(draft?.fileRefs ?? []);
  const cloudEnvironments = await listCloudEnvironmentOptions(install.organizationId);
  const localRuntimes = await listAccessibleLocalRuntimeOptions({
    organizationId: install.organizationId,
    userId: account.userId,
    tool: selectedTool,
  });
  const channels = await listOrgTraceChannels({
    organizationId: install.organizationId,
  });
  if (channels.length === 0) return false;
  const metadata: AdvancedStartMetadata = {
    slackTeamId: input.slackTeamId,
    slackChannelId: input.slackChannelId,
    slackUserId: input.slackUserId,
    ...(input.draftId ? { draftId: input.draftId } : {}),
  };
  const channelOptions = channels.map((channel) => ({
    value: channel.id,
    label: `${channel.name} (${channel.type})`,
  }));
  const cloudOptions = [
    { value: "default", label: "Default cloud environment" },
    ...cloudEnvironments.map((environment) => ({
      value: environment.id,
      label: environment.isDefault ? `${environment.name} (default)` : environment.name,
    })),
  ];
  const runtimeOptions = [
    { value: "auto", label: "Auto-select local bridge" },
    ...localRuntimes.map((runtime) => ({ value: runtime.id, label: runtime.label })),
  ];
  const modelOptions = allModelOptions();
  const reasoningOptions = allReasoningOptions();
  const initialModel =
    modelOptions.find((option) => option.value === selectedModel) ?? modelOptions[0];
  const initialReasoning =
    reasoningOptions.find((option) => option.value === selectedReasoning) ?? reasoningOptions[0];
  const initialChannel =
    channelOptions.find((option) => option.value === (draft?.traceChannelId ?? binding.traceChannelId)) ??
    channelOptions[0]!;
  const initialPrompt = draft?.prompt ?? "";
  const attachmentText =
    fileRefs.length > 0
      ? `Attached images: ${fileRefs.map((ref) => ref.name).join(", ")}`.slice(0, 2900)
      : "No images attached.";

  await client.views
    .open({
      trigger_id: input.triggerId,
      view: {
        type: "modal",
        callback_id: "trace_advanced_start",
        title: { type: "plain_text", text: "Start Trace" },
        submit: { type: "plain_text", text: "Start" },
        close: { type: "plain_text", text: "Cancel" },
        private_metadata: JSON.stringify(metadata),
        blocks: [
          {
            type: "input",
            block_id: "prompt",
            label: { type: "plain_text", text: "Prompt" },
            optional: fileRefs.length > 0,
            element: {
              type: "plain_text_input",
              action_id: "value",
              multiline: true,
              ...(initialPrompt ? { initial_value: initialPrompt } : {}),
            },
          },
          {
            type: "input",
            block_id: "channel",
            label: { type: "plain_text", text: "Trace channel" },
            element: {
              type: "static_select",
              action_id: "value",
              initial_option: {
                text: { type: "plain_text", text: initialChannel.label.slice(0, 75) },
                value: initialChannel.value,
              },
              options: slackSelectOptions(channelOptions),
            },
          },
          {
            type: "input",
            block_id: "tool",
            label: { type: "plain_text", text: "Tool" },
            element: {
              type: "static_select",
              action_id: "value",
              initial_option: {
                text: {
                  type: "plain_text",
                  text: selectedTool === "codex" ? "Codex" : "Claude Code",
                },
                value: selectedTool,
              },
              options: slackSelectOptions(defaultToolOptions()),
            },
          },
          {
            type: "input",
            block_id: "model",
            label: { type: "plain_text", text: "Model" },
            element: {
              type: "static_select",
              action_id: "value",
              ...(initialModel
                ? {
                    initial_option: {
                      text: { type: "plain_text", text: initialModel.label.slice(0, 75) },
                      value: initialModel.value,
                    },
                  }
                : {}),
              options: slackSelectOptions(modelOptions),
            },
          },
          {
            type: "input",
            block_id: "reasoning",
            label: { type: "plain_text", text: "Thinking" },
            element: {
              type: "static_select",
              action_id: "value",
              ...(initialReasoning
                ? {
                    initial_option: {
                      text: { type: "plain_text", text: initialReasoning.label.slice(0, 75) },
                      value: initialReasoning.value,
                    },
                  }
                : {}),
              options: slackSelectOptions(reasoningOptions),
            },
          },
          {
            type: "input",
            block_id: "hosting",
            label: { type: "plain_text", text: "Hosting" },
            element: {
              type: "static_select",
              action_id: "value",
              initial_option: {
                text: { type: "plain_text", text: slackSessionHosting() === "local" ? "Local" : "Cloud" },
                value: slackSessionHosting(),
              },
              options: slackSelectOptions([
                { value: "cloud", label: "Cloud" },
                { value: "local", label: "Local" },
              ]),
            },
          },
          {
            type: "input",
            block_id: "environment",
            label: { type: "plain_text", text: "Cloud environment" },
            optional: true,
            element: {
              type: "static_select",
              action_id: "value",
              initial_option: {
                text: { type: "plain_text", text: cloudOptions[0]!.label },
                value: cloudOptions[0]!.value,
              },
              options: slackSelectOptions(cloudOptions),
            },
          },
          {
            type: "input",
            block_id: "runtime",
            label: { type: "plain_text", text: "Local bridge" },
            optional: true,
            element: {
              type: "static_select",
              action_id: "value",
              initial_option: {
                text: { type: "plain_text", text: runtimeOptions[0]!.label },
                value: runtimeOptions[0]!.value,
              },
              options: slackSelectOptions(runtimeOptions),
            },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: attachmentText },
          },
        ],
      },
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to open advanced start modal:", errorMessage(err));
      return null;
    });
  return true;
}

function claimMentionEvent(teamId: string, channel: string, messageTs: string): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of recentMentionKeys) {
    if (expiresAt <= now) recentMentionKeys.delete(key);
  }

  const key = `${teamId}:${channel}:${messageTs}`;
  if (recentMentionKeys.has(key)) return false;
  recentMentionKeys.set(key, now + RECENT_MENTION_TTL_MS);
  return true;
}

const RUN_COMMAND_PREFIXES = [
  "run everything",
  "run all",
  "run application",
  "run app",
  "start everything",
  "start application",
  "start app",
];

// Detects the "run the whole application" command inside a thread already bound
// to a Trace session, e.g. "run", "run all", or "start app mortgages". Returns
// the optional trailing application id/name so a repo with several apps can be
// disambiguated.
function parseRunApplicationCommand(text: string): { matched: boolean; appArg: string | null } {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  if (lower === "run") return { matched: true, appArg: null };
  for (const prefix of RUN_COMMAND_PREFIXES) {
    if (lower === prefix) return { matched: true, appArg: null };
    if (lower.startsWith(`${prefix} `)) {
      return { matched: true, appArg: normalized.slice(prefix.length).trim() || null };
    }
  }
  return { matched: false, appArg: null };
}

async function handleSlackRunApplication(input: {
  teamId: string;
  channel: string;
  threadTs: string;
  slackUserId: string;
  organizationId: string;
  sessionId: string;
  sessionGroupId: string | null;
  appArg: string | null;
}): Promise<void> {
  const { teamId, channel, threadTs, slackUserId, organizationId, sessionGroupId, appArg } = input;

  const account = await resolveSlackAccount(teamId, slackUserId);
  if (!account) {
    await postLinkPrompt({ slackTeamId: teamId, slackUserId, slackChannelId: channel, threadTs });
    return;
  }
  const traceUserId = account.userId;

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId: traceUserId, organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "Your Trace account is not in this workspace's org, so it can't run applications here.",
    });
    return;
  }

  if (!sessionGroupId) {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "This session isn't connected to a repo, so there's no application to run.",
    });
    return;
  }

  let applications: Array<{ id: string; name: string }>;
  try {
    applications = await sessionApplicationService.listApplications(
      sessionGroupId,
      organizationId,
      traceUserId,
    );
  } catch (err: unknown) {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: `Couldn't load applications: ${errorMessage(err)}`,
    });
    return;
  }

  if (applications.length === 0) {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "No application is configured for this repo yet.",
    });
    return;
  }

  let target: { id: string; name: string } | undefined;
  if (appArg) {
    const needle = appArg.toLowerCase();
    target = applications.find(
      (app) => app.id.toLowerCase() === needle || app.name.toLowerCase() === needle,
    );
    if (!target) {
      await postMentionFeedback({
        slackTeamId: teamId,
        slackChannelId: channel,
        slackUserId,
        threadTs,
        text: `No application named "${appArg}". Available: ${applications
          .map((app) => `\`${app.id}\``)
          .join(", ")}.`,
      });
      return;
    }
  } else if (applications.length === 1) {
    target = applications[0];
  } else {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: `This repo has multiple applications. Pick one: ${applications
        .map((app) => `\`run ${app.id}\``)
        .join(", ")}.`,
    });
    return;
  }

  const app = target;
  // Subscribe before starting so the bridge captures the first progress events
  // (the initial setup step is often the slowest) rather than missing them.
  slackEventBridge.attachGroup(sessionGroupId, {
    slackTeamId: teamId,
    slackChannelId: channel,
    slackThreadTs: threadTs,
  });

  try {
    await sessionApplicationWorkflowService.startWorkflow(
      sessionGroupId,
      app.id,
      organizationId,
      traceUserId,
    );
  } catch (err: unknown) {
    slackEventBridge.detachGroup(sessionGroupId);
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: `Couldn't start *${app.name}*: ${errorMessage(err)}`,
    });
    return;
  }

  await postThreadNotice({
    slackTeamId: teamId,
    slackChannelId: channel,
    slackThreadTs: threadTs,
    text: `🚀 Starting *${app.name}* — I'll post progress here and share the link once it's live.`,
  });
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
  if (!claimMentionEvent(teamId, channel, ts)) {
    console.info("[slack] ignoring duplicate mention event", { teamId, channel, threadTs });
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
    select: {
      id: true,
      sessionId: true,
      session: { select: { worktreeDeleted: true, sessionGroupId: true } },
    },
  });
  if (existingThread) {
    console.info("[slack] app_mention for existing Trace thread", { teamId, channel, threadTs });
    if (existingThread.session.worktreeDeleted) {
      await postThreadNotice({
        slackTeamId: teamId,
        slackChannelId: channel,
        slackThreadTs: threadTs,
        text: "This Trace session's worktree has been deleted, so it can't accept new messages.",
      });
      return;
    }
    const commandText = stripBotMention(
      typeof event.text === "string" ? event.text : "",
      install.botUserId,
    ).trim();
    const runCommand = parseRunApplicationCommand(commandText);
    if (runCommand.matched) {
      await handleSlackRunApplication({
        teamId,
        channel,
        threadTs,
        slackUserId,
        organizationId: install.organizationId,
        sessionId: existingThread.sessionId,
        sessionGroupId: existingThread.session.sessionGroupId,
        appArg: runCommand.appArg,
      });
      return;
    }
    await handleThreadMessage({ teamId, event });
    return;
  }

  const account = await resolveSlackAccount(teamId, slackUserId);
  if (!account) {
    console.info("[slack] prompting unlinked Slack user", { teamId, slackUserId, channel, threadTs });
    await postLinkPrompt({
      slackTeamId: teamId,
      slackUserId,
      slackChannelId: channel,
      threadTs,
    });
    return;
  }
  const traceUserId = account.userId;

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId: traceUserId, organizationId: install.organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "Your Slack account is linked, but your Trace account is not in the connected Trace org. Ask a Trace org admin to invite you, then try again.",
    });
    return;
  }

  const binding = await resolveSlackChannelBinding(teamId, channel);
  if (!binding || binding.organizationId !== install.organizationId) {
    await postBindPrompt({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "This Slack channel is not connected to Trace yet. Bind it to a Trace channel before starting sessions here.",
    });
    return;
  }

  const rawText = typeof event.text === "string" ? event.text : "";
  const parsed = parseSlackPrompt(stripBotMention(rawText, install.botUserId));
  const threadContext = await loadSlackThreadContext({
    slackTeamId: teamId,
    slackChannelId: channel,
    slackThreadTs: threadTs,
    mentionTs: ts,
    botUserId: install.botUserId,
  });
  const prompt = promptWithSlackThreadContext({
    prompt: parsed.prompt,
    threadContext,
  });

  const files = await ingestSlackFiles({
    slackTeamId: teamId,
    organizationId: install.organizationId,
    files: event.files,
  });
  if (!prompt && files.refs.length === 0) {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "Tell Trace what to do after the mention, like `@trace fix the failing test`. You can also use `/trace start` for advanced setup.",
    });
    if (files.warnings.length > 0) {
      await postMentionFeedback({
        slackTeamId: teamId,
        slackChannelId: channel,
        slackUserId,
        threadTs,
        text: files.warnings.join(" "),
      });
    }
    return;
  }

  const draftId = await createSlackSessionDraft({
    slackTeamId: teamId,
    slackChannelId: channel,
    slackThreadTs: threadTs,
    slackUserId,
    organizationId: install.organizationId,
    traceChannelId: binding.traceChannelId,
    prompt,
    fileRefs: files.refs,
  });
  if (parsed.yolo) {
    try {
      const settings = await recommendedSettingsForDraft(draftId, slackUserId);
      await startSlackSessionFromDraft({ draftId, slackUserId, settings });
    } catch (err: unknown) {
      await postMentionFeedback({
        slackTeamId: teamId,
        slackChannelId: channel,
        slackUserId,
        threadTs,
        text: `Could not start with recommended settings: ${errorMessage(err)}`,
      });
    }
    return;
  }

  const settingsSummary = await recommendedSettingsSummaryForDraft(draftId, slackUserId);
  const posted = await postStartDraftPrompt({
    slackTeamId: teamId,
    slackChannelId: channel,
    slackThreadTs: threadTs,
    slackUserId,
    draftId,
    prompt,
    fileRefs: files.refs,
    warnings: files.warnings,
    settingsSummary,
  });
  if (!posted) {
    await postMentionFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "Trace received your mention, but could not post the start prompt. Try again in a moment or use `/trace start`.",
    });
  }
}

async function startSlackSessionFromDraft(input: {
  draftId: string;
  slackUserId: string;
  settings: SlackSessionSettings;
  traceChannelId?: string | null;
  promptOverride?: string | null;
}): Promise<void> {
  const draft = await loadSlackSessionDraft(input.draftId, input.slackUserId);
  if (!draft) throw new Error("This Slack session draft is no longer available. Mention `@trace` again.");

  const account = await resolveSlackAccount(draft.slackTeamId, draft.slackUserId);
  if (!account) throw new Error("Link your Trace account before starting a session");

  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: account.userId,
        organizationId: draft.organizationId,
      },
    },
    select: { userId: true },
  });
  if (!membership) throw new Error("Your Trace account is not in this workspace's org");

  const traceChannelId = input.traceChannelId ?? draft.traceChannelId;
  if (!traceChannelId) throw new Error("This Slack channel is not bound to a Trace channel");
  const channel = await prisma.channel.findFirst({
    where: { id: traceChannelId, organizationId: draft.organizationId },
    select: { id: true },
  });
  if (!channel) throw new Error("Trace channel not found");

  const fileRefs = parseSlackFileRefs(draft.fileRefs);
  const imageKeys = imageKeysFromFileRefs(fileRefs);
  const prompt = (input.promptOverride ?? draft.prompt).trim() || fallbackPromptForImages(imageKeys);
  try {
    await startSlackSession({
      slackTeamId: draft.slackTeamId,
      slackChannelId: draft.slackChannelId,
      slackThreadTs: draft.slackThreadTs,
      organizationId: draft.organizationId,
      traceChannelId,
      actorUserId: account.userId,
      prompt,
      imageKeys,
      settings: input.settings,
      source: "mention",
    });
    await deleteSlackSessionDraft(draft.id);
  } catch (err: unknown) {
    const message = errorMessage(err);
    console.warn("[slack] failed to start session", {
      slackTeamId: draft.slackTeamId,
      slackUserId: draft.slackUserId,
      channel: draft.slackChannelId,
      threadTs: draft.slackThreadTs,
      error: message,
    });
    const client = await getSlackClient(draft.slackTeamId);
    if (client) {
      await client.chat
        .postEphemeral({
          channel: draft.slackChannelId,
          user: draft.slackUserId,
          thread_ts: draft.slackThreadTs,
          text: `Could not start a Trace session: ${message}`,
        })
        .catch(() => {});
    }
    return;
  }
}

async function recommendedSettingsForDraft(draftId: string, slackUserId: string): Promise<SlackSessionSettings> {
  const draft = await loadSlackSessionDraft(draftId, slackUserId);
  if (!draft) throw new Error("This Slack session draft is no longer available. Mention `@trace` again.");

  const account = await resolveSlackAccount(draft.slackTeamId, draft.slackUserId);
  if (!account) throw new Error("Link your Trace account before starting a session");
  const defaults = await getTraceDefaults(account.userId);
  const localRuntimes = await listAccessibleLocalRuntimeOptions({
    organizationId: draft.organizationId,
    userId: account.userId,
    tool: defaults.tool,
  });
  if (slackSessionHosting() === "local") {
    if (localRuntimes.length === 1) {
      return {
        tool: defaults.tool,
        model: defaults.model,
        reasoningEffort: defaults.reasoningEffort,
        hosting: "local",
        runtimeInstanceId: localRuntimes[0]!.id,
      };
    }
    throw new Error("Choose Configure to select a local bridge.");
  }

  const cloudEnvironments = await listCloudEnvironmentOptions(draft.organizationId);
  if (cloudEnvironments.length > 0) {
    return {
      tool: null,
      model: null,
      reasoningEffort: null,
      hosting: "cloud",
      environmentId: cloudEnvironments[0]?.id ?? null,
    };
  }

  if (localRuntimes.length === 1) {
    return {
      tool: defaults.tool,
      model: defaults.model,
      reasoningEffort: defaults.reasoningEffort,
      hosting: "local",
      runtimeInstanceId: localRuntimes[0]!.id,
    };
  }

  throw new Error("Choose Configure to select cloud or a local bridge.");
}

async function recommendedSettingsSummaryForDraft(
  draftId: string,
  slackUserId: string,
): Promise<string> {
  const draft = await loadSlackSessionDraft(draftId, slackUserId);
  if (!draft) return "*Will use:*\n- Draft no longer available.";
  const account = await resolveSlackAccount(draft.slackTeamId, draft.slackUserId);
  if (!account) return "*Will use:*\n- Link Trace account first.";

  const defaults = await getTraceDefaults(account.userId);
  try {
    const settings = await recommendedSettingsForDraft(draftId, slackUserId);
    const tool = settings.tool ?? defaults.tool;
    const model = settings.model ?? defaults.model;
    const reasoningEffort = settings.reasoningEffort ?? defaults.reasoningEffort;
    const lines = [
      "*Will use:*",
      `- *Hosting:* ${settings.hosting === "local" ? "Local bridge" : "Cloud"}`,
      `- *Tool:* ${toolLabelForSlack(tool)}`,
      `- *Model:* ${modelLabelForSlack(tool, model)}`,
      `- *Thinking:* ${reasoningLabelForSlack(reasoningEffort)}`,
    ];

    if (settings.hosting === "cloud") {
      const cloudEnvironments = await listCloudEnvironmentOptions(draft.organizationId);
      const environment = settings.environmentId
        ? cloudEnvironments.find((option) => option.id === settings.environmentId)
        : null;
      lines.push(`- *Environment:* ${environment?.name ?? "Default cloud environment"}`);
    } else {
      const runtime =
        settings.runtimeInstanceId
          ? sessionRouter.getRuntime(settings.runtimeInstanceId, draft.organizationId)
          : null;
      lines.push(`- *Bridge:* ${runtime?.label ?? "Auto-select local bridge"}`);
    }

    return lines.join("\n");
  } catch (err: unknown) {
    return `*Will use:*\n- ${errorMessage(err)}`;
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
  if (event.subtype && event.subtype !== "file_share") return;

  const thread = await prisma.slackThreadSession.findUnique({
    where: {
      slackTeamId_slackChannelId_slackThreadTs: {
        slackTeamId: teamId,
        slackChannelId: channel,
        slackThreadTs: threadTs,
      },
    },
    select: {
      sessionId: true,
      organizationId: true,
      session: {
        select: {
          hosting: true,
          sessionGroupId: true,
          connection: true,
          worktreeDeleted: true,
          sessionGroup: { select: { connection: true } },
        },
      },
    },
  });
  if (!thread) return;

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: teamId },
    select: { botUserId: true },
  });
  if (!install) return;

  const rawText = typeof event.text === "string" ? event.text : "";
  if (!rawText.includes(`<@${install.botUserId}>`)) {
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

  const text = stripBotMention(rawText, install.botUserId);
  if (thread.session.worktreeDeleted) {
    await postThreadNotice({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackThreadTs: threadTs,
      text: "This Trace session's worktree has been deleted, so it can't accept new messages.",
    });
    return;
  }

  const runtimeInstanceId =
    connectionRuntimeInstanceId(thread.session.connection) ??
    connectionRuntimeInstanceId(thread.session.sessionGroup?.connection);
  if (thread.session.hosting === "local" && runtimeInstanceId) {
    const access = await runtimeAccessService.getAccessState({
      userId: traceUserId,
      organizationId: thread.organizationId,
      runtimeInstanceId,
      sessionGroupId: thread.session.sessionGroupId,
      capability: "session",
    });
    if (!access.allowed) {
      await postSessionAccessRequestPrompt({
        slackTeamId: teamId,
        slackChannelId: channel,
        slackThreadTs: threadTs,
        requesterSlackUserId: slackUserId,
        runtimeLabel: access.label,
      });
      return;
    }
  }

  const files = await ingestSlackFiles({
    slackTeamId: teamId,
    organizationId: thread.organizationId,
    files: event.files,
  });
  const imageKeys = imageKeysFromFileRefs(files.refs);
  if (!text && imageKeys.length === 0) {
    if (files.warnings.length > 0) {
      await postSessionAccessRequestFeedback({
        slackTeamId: teamId,
        slackChannelId: channel,
        slackThreadTs: threadTs,
        requesterSlackUserId: slackUserId,
        text: files.warnings.join(" "),
      });
    }
    return;
  }

  slackEventBridge.attach(thread.sessionId, {
    slackTeamId: teamId,
    slackChannelId: channel,
    slackThreadTs: threadTs,
  });

  await sessionService.sendMessage({
    sessionId: thread.sessionId,
    text: text || fallbackPromptForImages(imageKeys),
    imageKeys,
    actorType: "user",
    actorId: traceUserId,
    clientSource: "slack",
  });
  if (files.warnings.length > 0) {
    await postSessionAccessRequestFeedback({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackThreadTs: threadTs,
      requesterSlackUserId: slackUserId,
      text: files.warnings.join(" "),
    });
  }
}

async function handleBotJoinedChannel(input: { teamId: string; event: SlackEventBody }): Promise<void> {
  const { teamId, event } = input;
  const channel = event.channel;
  const user = event.user;
  if (!channel || !user) return;

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: teamId },
    select: { botUserId: true },
  });
  if (!install || user !== install.botUserId) return;

  const binding = await resolveSlackChannelBinding(teamId, channel);
  if (binding) return;

  await postBindPrompt({
    slackTeamId: teamId,
    slackChannelId: channel,
    text: "Trace is installed here. Bind this Slack channel to a Trace channel before starting sessions.",
  });
}

async function startSlackSessionFromModal(input: {
  metadata: AdvancedStartMetadata;
  prompt: string;
  traceChannelId: string;
  tool: CodingTool;
  model: string | null;
  reasoningEffort: string | null;
  hosting: "cloud" | "local";
  environmentId?: string | null;
  runtimeInstanceId?: string | null;
}): Promise<void> {
  const { metadata } = input;
  const account = await resolveSlackAccount(metadata.slackTeamId, metadata.slackUserId);
  if (!account) throw new Error("Link your Trace account before starting a session");

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: metadata.slackTeamId },
    select: { organizationId: true },
  });
  if (!install) throw new Error("Slack is not installed for this workspace");

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId: account.userId, organizationId: install.organizationId } },
    select: { userId: true },
  });
  if (!membership) throw new Error("Your Trace account is not in this workspace's org");

  const channel = await prisma.channel.findFirst({
    where: { id: input.traceChannelId, organizationId: install.organizationId },
    select: { id: true },
  });
  if (!channel) throw new Error("Trace channel not found");

  const settings = validateSlackSessionConfig({
    tool: input.tool,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
  });
  const draft = metadata.draftId
    ? await loadSlackSessionDraft(metadata.draftId, metadata.slackUserId)
    : null;
  if (metadata.draftId && !draft) {
    throw new Error("This Slack session draft is no longer available. Mention `@trace` again.");
  }
  const fileRefs = parseSlackFileRefs(draft?.fileRefs ?? []);
  const imageKeys = imageKeysFromFileRefs(fileRefs);
  const prompt = input.prompt.trim() || fallbackPromptForImages(imageKeys);

  await sessionService.updateDefaults(account.userId, {
    tool: settings.tool,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
  });

  await startSlackSession({
    slackTeamId: metadata.slackTeamId,
    slackChannelId: metadata.slackChannelId,
    slackThreadTs: draft?.slackThreadTs,
    organizationId: install.organizationId,
    traceChannelId: input.traceChannelId,
    actorUserId: account.userId,
    prompt,
    imageKeys,
    settings: {
      ...settings,
      hosting: input.hosting,
      environmentId: input.environmentId,
      runtimeInstanceId: input.runtimeInstanceId,
    },
    source: "modal",
  });
  if (metadata.draftId) await deleteSlackSessionDraft(metadata.draftId);
}

async function handleSessionAccessRequestAction(payload: SlackInteractionPayload): Promise<void> {
  const action = payload.actions?.[0];
  const value = decodeSlackBridgeAccessRequestValue(action?.value);
  const actingSlackUserId = payload.user?.id;
  if (!value || actingSlackUserId !== value.requesterSlackUserId) {
    console.warn("[slack] ignored invalid bridge access request action", {
      actionUserId: actingSlackUserId,
      requesterSlackUserId: value?.requesterSlackUserId,
      hasValue: !!value,
    });
    return;
  }

  const client = await getSlackClient(value.slackTeamId);
  if (!client) return;

  const requesterAccount = await resolveSlackAccount(value.slackTeamId, value.requesterSlackUserId);
  if (!requesterAccount) {
    await postLinkPrompt({
      slackTeamId: value.slackTeamId,
      slackUserId: value.requesterSlackUserId,
      slackChannelId: value.slackChannelId,
      threadTs: value.slackThreadTs,
    });
    return;
  }

  const thread = await prisma.slackThreadSession.findUnique({
    where: {
      slackTeamId_slackChannelId_slackThreadTs: {
        slackTeamId: value.slackTeamId,
        slackChannelId: value.slackChannelId,
        slackThreadTs: value.slackThreadTs,
      },
    },
    select: {
      sessionId: true,
      organizationId: true,
      session: {
        select: {
          hosting: true,
          sessionGroupId: true,
          name: true,
          connection: true,
          sessionGroup: { select: { connection: true } },
        },
      },
    },
  });
  if (!thread) {
    await postSessionAccessRequestFeedback({
      ...value,
      text: "This Slack thread is no longer connected to a Trace session.",
    });
    return;
  }

  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: requesterAccount.userId,
        organizationId: thread.organizationId,
      },
    },
    select: { userId: true },
  });
  if (!membership) {
    await postSessionAccessRequestFeedback({
      ...value,
      text: "Your Trace account is not in this workspace's org.",
    });
    return;
  }

  if (thread.session.hosting !== "local") {
    await postSessionAccessRequestFeedback({
      ...value,
      text: "This Trace session is no longer running on a local bridge. Try replying again.",
    });
    return;
  }

  const runtimeInstanceId =
    connectionRuntimeInstanceId(thread.session.connection) ??
    connectionRuntimeInstanceId(thread.session.sessionGroup?.connection);
  if (!runtimeInstanceId || !thread.session.sessionGroupId) {
    await postSessionAccessRequestFeedback({
      ...value,
      text: "This local session is not bound to a bridge yet. Try again after the owner starts it.",
    });
    return;
  }

  const access = await runtimeAccessService.getAccessState({
    userId: requesterAccount.userId,
    organizationId: thread.organizationId,
    runtimeInstanceId,
    sessionGroupId: thread.session.sessionGroupId,
    capability: "session",
  });
  if (access.allowed) {
    await postSessionAccessRequestFeedback({
      ...value,
      text: "Bridge access is already granted. You can reply in this Slack thread now.",
    });
    return;
  }

  const request = await runtimeAccessService.requestAccess({
    requesterUserId: requesterAccount.userId,
    organizationId: thread.organizationId,
    runtimeInstanceId,
    scopeType: "session_group",
    sessionGroupId: thread.session.sessionGroupId,
    requestedCapabilities: ["session"],
  });

  const ownerAccount = await prisma.slackAccount.findFirst({
    where: { slackTeamId: value.slackTeamId, userId: request.ownerUserId },
    select: { slackUserId: true },
  });
  if (!ownerAccount) {
    await postSessionAccessRequestFeedback({
      ...value,
      text: "Bridge access request sent in Trace. The bridge owner has not linked Slack, so no Slack DM was sent.",
    });
    return;
  }

  const requester = await prisma.user.findUnique({
    where: { id: requesterAccount.userId },
    select: { name: true, email: true },
  });
  const requesterLabel = requester?.name?.trim() || requester?.email?.trim() || "A Trace user";
  const traceLink = await buildTraceSessionLink(thread.sessionId);

  const dm = await client.conversations.open({ users: ownerAccount.slackUserId }).catch((err: unknown) => {
    console.warn("[slack] failed to open bridge owner DM:", errorMessage(err));
    return null;
  });
  const dmChannel = dm?.channel?.id;
  if (!dmChannel) {
    await postSessionAccessRequestFeedback({
      ...value,
      text: "Bridge access request sent in Trace, but I could not open a Slack DM with the bridge owner.",
    });
    return;
  }

  try {
    await client.chat.postMessage({
      channel: dmChannel,
      text: `${requesterLabel} requested bridge access from Slack.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${requesterLabel}* requested access to reply from Slack using your local bridge.${traceLink ? `\n<${traceLink}|Open in Trace>` : ""}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve" },
              style: "primary",
              action_id: "trace_bridge_access_approve",
              value: encodeSlackBridgeAccessApproveValue({ ...value, requestId: request.id }),
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.warn("[slack] failed to DM bridge access request:", errorMessage(err));
    await postSessionAccessRequestFeedback({
      ...value,
      text: "Bridge access request sent in Trace, but I could not send the Slack DM.",
    });
    return;
  }

  await postSessionAccessRequestFeedback({
    ...value,
    text: `Bridge access request sent to <@${ownerAccount.slackUserId}>.`,
  });
}

async function handleSessionAccessApproveAction(payload: SlackInteractionPayload): Promise<void> {
  const action = payload.actions?.[0];
  const value = decodeSlackBridgeAccessApproveValue(action?.value);
  const ownerSlackUserId = payload.user?.id;
  if (!value || !ownerSlackUserId) return;

  const ownerAccount = await resolveSlackAccount(value.slackTeamId, ownerSlackUserId);
  if (!ownerAccount) return;
  const request = await prisma.bridgeAccessRequest.findUnique({
    where: { id: value.requestId },
    include: { bridgeRuntime: true },
  });
  if (!request || request.ownerUserId !== ownerAccount.userId) return;

  await runtimeAccessService.approveRequest({
    requestId: request.id,
    organizationId: request.bridgeRuntime.organizationId,
    ownerUserId: ownerAccount.userId,
    scopeType: "session_group",
    sessionGroupId: request.sessionGroupId,
    capabilities: ["session"],
  });
  await postSessionAccessRequestFeedback({
    slackTeamId: value.slackTeamId,
    slackChannelId: value.slackChannelId,
    slackThreadTs: value.slackThreadTs,
    requesterSlackUserId: value.requesterSlackUserId,
    text: "Bridge access approved. You can reply in this Slack thread now.",
  });
}

function isBotMessageCandidate(event: SlackEventBody): boolean {
  return event.type === "message" && !!event.bot_id && !event.thread_ts;
}

function isTraceMentionMessage(event: SlackEventBody, botUserId: string): boolean {
  const rawText = typeof event.text === "string" ? event.text : "";
  return rawText.includes(`<@${botUserId}>`);
}

async function handleBotMessageCandidate(_input: {
  teamId: string;
  event: SlackEventBody;
}): Promise<void> {
  // Intentionally a no-op for now. Keeping this as a named handler preserves
  // Slack bot/app metadata for future "suggest a Trace session" rules without
  // allowing arbitrary bots to start sessions.
}

async function handleDirectMessage(input: {
  teamId: string;
  event: SlackEventBody;
}): Promise<void> {
  const slackUserId = input.event.user;
  const channel = input.event.channel;
  if (!slackUserId || !channel) return;
  if (input.event.subtype && input.event.subtype !== "file_share") return;

  const account = await resolveSlackAccount(input.teamId, slackUserId);
  if (!account) {
    await postDirectMessageLinkPrompt({
      slackTeamId: input.teamId,
      slackChannelId: channel,
      slackUserId,
    });
    return;
  }

  await postDirectMessageUsage({
    slackTeamId: input.teamId,
    slackChannelId: channel,
  });
}

async function handleMessage(input: {
  teamId: string;
  event: SlackEventBody;
}): Promise<void> {
  const { teamId, event } = input;
  if (isBotMessageCandidate(event)) {
    await handleBotMessageCandidate({ teamId, event });
    return;
  }

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId: teamId },
    select: { botUserId: true },
  });
  if (install && isTraceMentionMessage(event, install.botUserId)) {
    await handleAppMention({ teamId, event });
    return;
  }

  if (event.channel_type === "im") {
    await handleDirectMessage({ teamId, event });
    return;
  }

  if (event.subtype && event.subtype !== "file_share") return;
  await handleThreadMessage({ teamId, event });
}

async function disconnectSlackTeams(teamIds: string[], organizationId?: string): Promise<void> {
  if (teamIds.length === 0) return;
  const teamWhere = { slackTeamId: { in: teamIds } };
  await prisma.$transaction([
    prisma.slackSessionDraft.deleteMany({
      where: { ...teamWhere, ...(organizationId ? { organizationId } : {}) },
    }),
    prisma.slackThreadSession.deleteMany({
      where: { ...teamWhere, ...(organizationId ? { organizationId } : {}) },
    }),
    prisma.slackChannelBinding.deleteMany({
      where: { ...teamWhere, ...(organizationId ? { organizationId } : {}) },
    }),
    prisma.slackAccount.deleteMany({ where: teamWhere }),
    prisma.slackInstall.deleteMany({
      where: { ...teamWhere, ...(organizationId ? { organizationId } : {}) },
    }),
  ]);
  for (const teamId of teamIds) {
    invalidateSlackClient(teamId);
  }
}

async function handleUninstall(teamId: string): Promise<void> {
  await disconnectSlackTeams([teamId]).catch(() => {});
}

async function claimSlackEventDelivery(envelope: SlackEventEnvelope): Promise<boolean> {
  const eventId = envelope.event_id;
  if (!eventId) return true;

  await prisma.slackProcessedEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });

  try {
    await prisma.slackProcessedEvent.create({
      data: {
        slackEventId: eventId,
        slackTeamId: envelope.team_id ?? null,
      },
    });
    return true;
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
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

  if (event.type === "member_joined_channel") {
    await handleBotJoinedChannel({ teamId, event });
    return;
  }

  if (event.type === "app_uninstalled" || event.type === "tokens_revoked") {
    await handleUninstall(teamId);
    return;
  }
}

router.post(
  "/commands",
  express.raw({ type: "application/x-www-form-urlencoded" }),
  async (req: Request, res: Response) => {
    if (!isSlackConfigured()) {
      res.status(503).json({ response_type: "ephemeral", text: "Slack is not configured." });
      return;
    }

    const rawBody = readSignedRawBody(req, res);
    if (rawBody === null) return;
    const params = new URLSearchParams(rawBody);
    const command: SlackCommandBody = {
      team_id: params.get("team_id") ?? undefined,
      channel_id: params.get("channel_id") ?? undefined,
      user_id: params.get("user_id") ?? undefined,
      trigger_id: params.get("trigger_id") ?? undefined,
      text: params.get("text") ?? undefined,
    };
    const teamId = command.team_id;
    const channelId = command.channel_id;
    const userId = command.user_id;
    const subcommand = command.text?.trim().split(/\s+/)[0]?.toLowerCase() || "help";

    if (!teamId || !channelId || !userId) {
      res.status(200).json({ response_type: "ephemeral", text: "Slack command payload was missing required fields." });
      return;
    }

    if (subcommand === "start" && command.trigger_id) {
      const account = await resolveSlackAccount(teamId, userId);
      if (!account) {
        res.status(200).json({
          response_type: "ephemeral",
          text: "Link your Trace account before starting a session.",
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: "Link your Trace account before starting a session." } },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Link account" }, url: buildAccountLinkUrl(teamId, userId), action_id: "link_account" }] },
          ],
        });
        return;
      }
      const binding = await resolveSlackChannelBinding(teamId, channelId);
      if (!binding) {
        res.status(200).json({
          response_type: "ephemeral",
          text: "Bind this Slack channel to a Trace channel before starting sessions.",
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: "Bind this Slack channel to a Trace channel before starting sessions." } },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Bind channel" }, url: buildBindUrl(teamId, channelId, userId), action_id: "bind_channel" }] },
          ],
        });
        return;
      }
      res.status(200).json({ response_type: "ephemeral", text: "Opening advanced start..." });
      void openAdvancedStartModal({
        slackTeamId: teamId,
        slackChannelId: channelId,
        slackUserId: userId,
        triggerId: command.trigger_id,
      }).then((opened) => {
        if (opened) return undefined;
        return postDraftActionFeedback({
          slackTeamId: teamId,
          slackChannelId: channelId,
          slackUserId: userId,
          text: "Could not open Trace start. Check that your Trace account is a member of the connected Trace org.",
        });
      });
      return;
    }

    if (subcommand === "bind") {
      res.status(200).json({
        response_type: "ephemeral",
        text: "Bind this Slack channel to Trace.",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: "Bind this Slack channel to a Trace channel." } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Bind channel" }, url: buildBindUrl(teamId, channelId, userId), action_id: "bind_channel" }] },
        ],
      });
      return;
    }

    if (subcommand === "prefs" || subcommand === "preferences" || subcommand === "setup") {
      res.status(200).json({
        response_type: "ephemeral",
        text: "Slack no longer has separate defaults. Use `/trace start` or `@trace <prompt>` and Configure to choose session settings.",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Slack no longer has separate defaults. Use `/trace start` or `@trace <prompt>` and Configure to choose tool, model, thinking, and hosting.",
            },
          },
        ],
      });
      return;
    }

    res.status(200).json({
      response_type: "ephemeral",
      text: "Use `@trace <prompt>`, `/trace bind`, or `/trace start`.",
    });
  },
);

router.post(
  "/interactions",
  express.raw({ type: "application/x-www-form-urlencoded" }),
  async (req: Request, res: Response) => {
    if (!isSlackConfigured()) {
      res.status(503).json({ error: "Slack is not configured" });
      return;
    }

    const rawBody = readSignedRawBody(req, res);
    if (rawBody === null) return;
    const payloadRaw = new URLSearchParams(rawBody).get("payload");
    if (!payloadRaw) {
      res.status(400).json({ error: "Missing payload" });
      return;
    }

    let payload: SlackInteractionPayload;
    try {
      payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
    } catch {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const actionId = payload.actions?.[0]?.action_id;
    if (payload.type === "block_actions" && actionId === "trace_start_draft") {
      res.status(200).json({});
      const draftId = payload.actions?.[0]?.value;
      const slackUserId = payload.user?.id;
      if (draftId && slackUserId) {
        void recommendedSettingsForDraft(draftId, slackUserId)
          .then((settings) =>
            startSlackSessionFromDraft({
              draftId,
              slackUserId,
              settings,
            }),
          )
          .catch(async (err: unknown) => {
            const draft = await loadSlackSessionDraft(draftId);
            if (!draft) {
              if (payload.team?.id && payload.channel?.id) {
                await postDraftUnavailableOrOwnerFeedback({
                  slackTeamId: payload.team.id,
                  slackChannelId: payload.channel.id,
                  slackUserId,
                  draftId,
                });
              }
              return;
            }
            if (draft.slackUserId !== slackUserId) {
              if (payload.team?.id && payload.channel?.id) {
                await postDraftUnavailableOrOwnerFeedback({
                  slackTeamId: payload.team.id,
                  slackChannelId: payload.channel.id,
                  slackUserId,
                  draftId,
                });
              }
              return;
            }
            await postSessionAccessRequestFeedback({
              slackTeamId: draft.slackTeamId,
              slackChannelId: draft.slackChannelId,
              slackThreadTs: draft.slackThreadTs,
              requesterSlackUserId: draft.slackUserId,
              text: `Could not start with recommended settings: ${errorMessage(err)}`,
            });
          });
      }
      return;
    }

    if (payload.type === "block_actions" && actionId === "trace_configure_draft") {
      res.status(200).json({});
      const draftId = payload.actions?.[0]?.value;
      if (draftId && payload.team?.id && payload.channel?.id && payload.user?.id && payload.trigger_id) {
        void openAdvancedStartModal({
          slackTeamId: payload.team.id,
          slackChannelId: payload.channel.id,
          slackUserId: payload.user.id,
          triggerId: payload.trigger_id,
          draftId,
        }).then((opened) => {
          if (opened) return undefined;
          return postDraftUnavailableOrOwnerFeedback({
            slackTeamId: payload.team!.id!,
            slackChannelId: payload.channel!.id!,
            slackUserId: payload.user!.id!,
            draftId,
          });
        });
      }
      return;
    }

    if (payload.type === "block_actions" && actionId === "trace_cancel_draft") {
      res.status(200).json({});
      const draftId = payload.actions?.[0]?.value;
      const slackUserId = payload.user?.id;
      if (draftId && slackUserId) {
        void loadSlackSessionDraft(draftId, slackUserId).then((draft) => {
          if (draft) return deleteSlackSessionDraft(draft.id);
          if (payload.team?.id && payload.channel?.id) {
            return postDraftUnavailableOrOwnerFeedback({
              slackTeamId: payload.team.id,
              slackChannelId: payload.channel.id,
              slackUserId,
              draftId,
              unavailableText: "This Trace start prompt is no longer available.",
            });
          }
          return undefined;
        });
      }
      return;
    }

    if (payload.type === "block_actions" && actionId === "trace_bridge_access_request") {
      res.status(200).json({});
      void handleSessionAccessRequestAction(payload).catch((err: unknown) => {
        console.warn("[slack] failed to request bridge access:", errorMessage(err));
      });
      return;
    }
    if (payload.type === "block_actions" && actionId === "trace_bridge_access_approve") {
      res.status(200).json({});
      void handleSessionAccessApproveAction(payload).catch((err: unknown) => {
        console.warn("[slack] failed to approve bridge access:", errorMessage(err));
      });
      return;
    }

    if (payload.type === "view_submission" && payload.view?.callback_id === "trace_advanced_start") {
      const prompt = getViewValue(payload, "prompt", "value")?.trim() ?? "";
      let metadata: AdvancedStartMetadata;
      try {
        metadata = JSON.parse(payload.view.private_metadata ?? "{}") as AdvancedStartMetadata;
      } catch {
        res.status(200).json({ response_action: "errors", errors: { prompt: "Invalid session metadata." } });
        return;
      }
      if (payload.user?.id !== metadata.slackUserId || payload.team?.id !== metadata.slackTeamId) {
        res.status(200).json({
          response_action: "errors",
          errors: { prompt: "Invalid session metadata." },
        });
        return;
      }
      const tool = normalizeTool(getViewValue(payload, "tool", "value")) ?? "claude_code";
      const hostingValue = getViewValue(payload, "hosting", "value");
      const hosting = hostingValue === "local" ? "local" : "cloud";
      const draft = metadata.draftId
        ? await loadSlackSessionDraft(metadata.draftId, metadata.slackUserId)
        : null;
      const hasImages = imageKeysFromFileRefs(parseSlackFileRefs(draft?.fileRefs ?? [])).length > 0;
      if (!prompt && !hasImages) {
        res.status(200).json({
          response_action: "errors",
          errors: { prompt: "Enter a prompt." },
        });
        return;
      }
      const traceChannelId = getViewValue(payload, "channel", "value");
      if (!traceChannelId) {
        res.status(200).json({
          response_action: "errors",
          errors: { channel: "Choose a Trace channel." },
        });
        return;
      }
      const environmentValue = getViewValue(payload, "environment", "value");
      const runtimeValue = getViewValue(payload, "runtime", "value");
      res.status(200).json({});
      void startSlackSessionFromModal({
        metadata,
        prompt,
        traceChannelId,
        tool,
        model: getViewValue(payload, "model", "value"),
        reasoningEffort: getViewValue(payload, "reasoning", "value"),
        hosting,
        environmentId:
          hosting === "cloud" && environmentValue && environmentValue !== "default"
            ? environmentValue
            : null,
        runtimeInstanceId:
          hosting === "local" && runtimeValue && runtimeValue !== "auto" ? runtimeValue : null,
      }).catch(async (err: unknown) => {
        const client = await getSlackClient(metadata.slackTeamId);
        if (!client) return;
        await client.chat
          .postEphemeral({
            channel: metadata.slackChannelId,
            user: metadata.slackUserId,
            text: `Could not start a Trace session: ${errorMessage(err)}`,
          })
          .catch(() => {});
      });
      return;
    }

    res.status(200).json({});
  },
);

router.post(
  "/events",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    if (!isSlackConfigured()) {
      res.status(503).json({ error: "Slack not configured", configured: false });
      return;
    }

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

    const claimed = await claimSlackEventDelivery(envelope).catch((err: unknown) => {
      console.error("[slack] event idempotency check failed:", errorMessage(err));
      return null;
    });
    if (claimed === null) {
      res.status(500).json({ error: "Could not process Slack event" });
      return;
    }
    if (!claimed) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }

    console.info("[slack] event received", {
      teamId: envelope.team_id,
      eventId: envelope.event_id,
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
