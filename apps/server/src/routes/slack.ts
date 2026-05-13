import { Router, type Router as RouterType, type Request, type Response } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import type { CodingTool } from "@prisma/client";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelsForTool,
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
import { getSlackClient, invalidateSlackClient } from "../lib/slack/client.js";
import {
  postLinkPrompt,
  resolveTraceUser,
  signSlackLinkState,
  verifySlackLinkState,
} from "../lib/slack/user-resolver.js";
import { slackEventBridge } from "../lib/slack/event-bridge.js";
import { sessionService } from "../services/session.js";

const JWT_SECRET = resolveJwtSecret();
const INSTALL_STATE_TTL_SECONDS = 10 * 60;
const BIND_STATE_TTL_SECONDS = 10 * 60;
const RECENT_MENTION_TTL_MS = 30 * 1000;
const recentMentionKeys = new Map<string, number>();
const SLACK_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "chat:write.public",
  "commands",
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
  if (normalized === "opus") return "claude-opus-4-7[1m]";
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

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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

function preferenceOptionsScript(): string {
  const modelsByTool = Object.fromEntries(
    defaultToolOptions().map((tool) => [tool.value, modelOptionsFor(tool.value as CodingTool)]),
  );
  const reasoningByTool = Object.fromEntries(
    defaultToolOptions().map((tool) => [tool.value, reasoningOptionsFor(tool.value as CodingTool)]),
  );
  const defaultModels = Object.fromEntries(
    defaultToolOptions().map((tool) => [tool.value, getDefaultModel(tool.value) ?? ""]),
  );
  const defaultReasoning = Object.fromEntries(
    defaultToolOptions().map((tool) => [tool.value, getDefaultReasoningEffort(tool.value) ?? ""]),
  );

  return `<script>
(() => {
  const modelsByTool = ${safeScriptJson(modelsByTool)};
  const reasoningByTool = ${safeScriptJson(reasoningByTool)};
  const defaultModels = ${safeScriptJson(defaultModels)};
  const defaultReasoning = ${safeScriptJson(defaultReasoning)};
  const tool = document.querySelector('select[name="tool"]');
  const model = document.querySelector('select[name="model"]');
  const reasoning = document.querySelector('select[name="reasoningEffort"]');
  const replaceOptions = (select, options, selectedValue) => {
    if (!select) return;
    select.innerHTML = "";
    for (const option of options || []) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      if (option.value === selectedValue) el.selected = true;
      select.appendChild(el);
    }
  };
  tool?.addEventListener("change", () => {
    const selectedTool = tool.value;
    replaceOptions(model, modelsByTool[selectedTool], defaultModels[selectedTool]);
    replaceOptions(reasoning, reasoningByTool[selectedTool], defaultReasoning[selectedTool]);
  });
})();
</script>`;
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
  const existing = await prisma.slackAccount.findUnique({
    where: { slackUserId_slackTeamId: { slackUserId: user, slackTeamId: team } },
    select: { preferredTool: true, preferredModel: true, preferredReasoningEffort: true },
  });
  const selectedTool = existing?.preferredTool ?? "claude_code";
  const selectedModel = existing?.preferredModel ?? getDefaultModel(selectedTool) ?? "";
  const selectedReasoning =
    existing?.preferredReasoningEffort ?? getDefaultReasoningEffort(selectedTool) ?? "";

  res.status(200).send(
    renderHtml(
      "Link Slack",
      `<h1>Link Slack account</h1><p>Link your Trace account to <b>${escapeHtml(teamName)}</b> and choose Slack defaults.</p><form method="POST" action="/slack/link/complete"><input type="hidden" name="team" value="${escapeHtml(team)}"><input type="hidden" name="user" value="${escapeHtml(user)}"><input type="hidden" name="state" value="${escapeHtml(stateRaw)}">${formSelect("tool", "Default tool", selectedTool, defaultToolOptions())}${formSelect("model", "Default model", selectedModel, modelOptionsFor(selectedTool))}${formSelect("reasoningEffort", "Default thinking", selectedReasoning, reasoningOptionsFor(selectedTool))}<button type="submit">Save and link</button></form>${preferenceOptionsScript()}`,
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
    const tool = normalizeTool(typeof body?.tool === "string" ? body.tool : null) ?? "claude_code";
    const model = typeof body?.model === "string" ? body.model : null;
    const reasoningEffort =
      typeof body?.reasoningEffort === "string" ? body.reasoningEffort : null;

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

    let preferences: { tool: CodingTool; model: string | null; reasoningEffort: string | null };
    try {
      preferences = validateSlackSessionConfig({ tool, model, reasoningEffort });
    } catch (err: unknown) {
      res.status(400).send(renderHtml("Link Slack", `<h1>Invalid defaults</h1><p>${escapeHtml(errorMessage(err))}</p>`));
      return;
    }

    await prisma.slackAccount.upsert({
      where: { slackUserId_slackTeamId: { slackUserId: user, slackTeamId: team } },
      create: {
        slackUserId: user,
        slackTeamId: team,
        userId,
        preferredTool: preferences.tool,
        preferredModel: preferences.model,
        preferredReasoningEffort: preferences.reasoningEffort,
      },
      update: {
        userId,
        preferredTool: preferences.tool,
        preferredModel: preferences.model,
        preferredReasoningEffort: preferences.reasoningEffort,
      },
    });

    const client = await getSlackClient(team);
    if (client) {
      void client.chat
        .postMessage({
          channel: user,
          text: "Linked. Your defaults are set. You can now mention `@trace` to start a session.",
        })
        .catch((err: unknown) => {
          console.warn("[slack] post-link DM failed:", (err as Error).message);
        });
    }

    res.status(200).send(
      renderHtml(
        "Link Slack",
        "<h1>Linked</h1><p>Your Trace account is now linked to Slack and your defaults are set. You can close this tab.</p>",
      ),
    );
  },
);

router.get("/preferences", async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

  const team = typeof req.query.team === "string" ? req.query.team : "";
  const user = typeof req.query.user === "string" ? req.query.user : "";
  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
  const state = verifySlackLinkState(stateRaw);
  if (!state || state.slackTeamId !== team || state.slackUserId !== user) {
    res.status(400).send(renderHtml("Slack preferences", "<h1>Invalid link</h1><p>This preferences link is invalid or expired.</p>"));
    return;
  }

  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    const webUrl = process.env.TRACE_WEB_URL?.replace(/\/$/, "") ?? "/";
    res.status(401).send(renderHtml("Slack preferences", `<h1>Sign in to Trace</h1><p>Sign in, then return to this page.</p><p><a class="button" href="${escapeHtml(webUrl)}">Open Trace</a></p>`));
    return;
  }

  const account = await prisma.slackAccount.findUnique({
    where: { slackUserId_slackTeamId: { slackUserId: user, slackTeamId: team } },
    select: { userId: true, preferredTool: true, preferredModel: true, preferredReasoningEffort: true },
  });
  if (!account || account.userId !== userId) {
    res.status(403).send(renderHtml("Slack preferences", "<h1>Not linked</h1><p>This Slack user is not linked to your Trace account.</p>"));
    return;
  }

  const selectedTool = account.preferredTool ?? "claude_code";
  res.status(200).send(
    renderHtml(
      "Slack preferences",
      `<h1>Slack defaults</h1><p>These defaults are used when you mention <code>@trace</code> without inline overrides.</p><form method="POST" action="/slack/preferences"><input type="hidden" name="team" value="${escapeHtml(team)}"><input type="hidden" name="user" value="${escapeHtml(user)}"><input type="hidden" name="state" value="${escapeHtml(stateRaw)}">${formSelect("tool", "Default tool", selectedTool, defaultToolOptions())}${formSelect("model", "Default model", account.preferredModel ?? getDefaultModel(selectedTool) ?? "", modelOptionsFor(selectedTool))}${formSelect("reasoningEffort", "Default thinking", account.preferredReasoningEffort ?? getDefaultReasoningEffort(selectedTool) ?? "", reasoningOptionsFor(selectedTool))}<button type="submit">Save preferences</button></form>${preferenceOptionsScript()}`,
    ),
  );
});

router.post("/preferences", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  if (!isSlackConfigured()) {
    renderSlackNotConfigured(res);
    return;
  }

  const body = req.body as Record<string, unknown>;
  const team = typeof body.team === "string" ? body.team : "";
  const user = typeof body.user === "string" ? body.user : "";
  const stateRaw = typeof body.state === "string" ? body.state : "";
  const state = verifySlackLinkState(stateRaw);
  if (!state || state.slackTeamId !== team || state.slackUserId !== user) {
    res.status(400).send(renderHtml("Slack preferences", "<h1>Invalid link</h1><p>This preferences link is invalid or expired.</p>"));
    return;
  }

  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).send(renderHtml("Slack preferences", "<h1>Sign in</h1><p>Sign in to Trace and try again.</p>"));
    return;
  }

  const tool = normalizeTool(typeof body.tool === "string" ? body.tool : null) ?? "claude_code";
  let preferences: { tool: CodingTool; model: string | null; reasoningEffort: string | null };
  try {
    preferences = validateSlackSessionConfig({
      tool,
      model: typeof body.model === "string" ? body.model : null,
      reasoningEffort: typeof body.reasoningEffort === "string" ? body.reasoningEffort : null,
    });
  } catch (err: unknown) {
    res.status(400).send(renderHtml("Slack preferences", `<h1>Invalid preferences</h1><p>${escapeHtml(errorMessage(err))}</p>`));
    return;
  }

  const updated = await prisma.slackAccount.updateMany({
    where: { slackUserId: user, slackTeamId: team, userId },
    data: {
      preferredTool: preferences.tool,
      preferredModel: preferences.model,
      preferredReasoningEffort: preferences.reasoningEffort,
    },
  });
  if (updated.count === 0) {
    res.status(403).send(renderHtml("Slack preferences", "<h1>Not linked</h1><p>This Slack user is not linked to your Trace account.</p>"));
    return;
  }

  res.status(200).send(renderHtml("Slack preferences", "<h1>Saved</h1><p>Your Slack defaults are updated.</p>"));
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
      res.status(403).send(renderHtml("Bind Slack channel", "<h1>Link required</h1><p>Link this Slack user to your Trace account before binding the channel.</p>"));
      return;
    }
  }

  const channels = await prisma.channel.findMany({
    where: {
      organizationId: install.organizationId,
      members: { some: { userId, leftAt: null } },
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
      res.status(403).send(renderHtml("Bind Slack channel", "<h1>Link required</h1><p>Link this Slack user to your Trace account before binding the channel.</p>"));
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
  channel_type?: string;
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
  trigger_id?: string;
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
};

function stripBotMention(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

type ParsedSlackPrompt = {
  prompt: string;
  tool?: CodingTool;
  model?: string;
  reasoningEffort?: string;
  hosting?: "cloud" | "local";
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

  result.prompt = promptParts.join(" ").trim();
  return result;
}

async function resolveSlackAccount(slackTeamId: string, slackUserId: string) {
  return prisma.slackAccount.findUnique({
    where: { slackUserId_slackTeamId: { slackUserId, slackTeamId } },
    select: {
      userId: true,
      preferredTool: true,
      preferredModel: true,
      preferredReasoningEffort: true,
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
      members: { some: { userId: input.boundById, leftAt: null } },
    },
    select: { id: true },
  });
  if (!channel) throw new Error("You do not have access to that Trace channel");

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

function buildPreferencesUrl(slackTeamId: string, slackUserId: string): string {
  const base = process.env.TRACE_WEB_URL?.replace(/\/$/, "") ?? "";
  const state = signSlackLinkState({ slackTeamId, slackUserId });
  const params = new URLSearchParams({
    team: slackTeamId,
    user: slackUserId,
    state,
  });
  return `${base}/slack/preferences?${params.toString()}`;
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

  if (input.slackUserId) {
    await client.chat
      .postEphemeral({
        channel: input.slackChannelId,
        user: input.slackUserId,
        thread_ts: input.threadTs,
        text,
        blocks,
      })
      .catch((err: unknown) => console.warn("[slack] failed to post bind prompt:", errorMessage(err)));
    return;
  }

  await client.chat
    .postMessage({
      channel: input.slackChannelId,
      text,
      blocks,
    })
    .catch((err: unknown) => console.warn("[slack] failed to post bind setup message:", errorMessage(err)));
}

function resolveEffectiveSlackSettings(input: {
  account: Awaited<ReturnType<typeof resolveSlackAccount>>;
  parsed: ParsedSlackPrompt;
}): { tool: CodingTool; model: string | null; reasoningEffort: string | null; hosting: "cloud" | "local" } {
  const tool = input.parsed.tool ?? input.account?.preferredTool ?? "claude_code";
  const model = input.parsed.model ?? input.account?.preferredModel ?? getDefaultModel(tool) ?? null;
  const reasoningEffort =
    input.parsed.reasoningEffort ??
    input.account?.preferredReasoningEffort ??
    getDefaultReasoningEffort(tool) ??
    null;
  const validated = validateSlackSessionConfig({ tool, model, reasoningEffort });
  return {
    ...validated,
    hosting: input.parsed.hosting ?? slackSessionHosting(),
  };
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

async function openAdvancedStartModal(input: {
  slackTeamId: string;
  slackChannelId: string;
  slackUserId: string;
  triggerId: string;
}): Promise<boolean> {
  const client = await getSlackClient(input.slackTeamId);
  if (!client) return false;
  const account = await resolveSlackAccount(input.slackTeamId, input.slackUserId);
  if (!account) return false;
  const binding = await resolveSlackChannelBinding(input.slackTeamId, input.slackChannelId);
  if (!binding) return false;
  const selectedTool = account.preferredTool ?? "claude_code";
  const selectedModel = account.preferredModel ?? getDefaultModel(selectedTool) ?? "";
  const selectedReasoning =
    account.preferredReasoningEffort ?? getDefaultReasoningEffort(selectedTool) ?? "";
  const metadata: AdvancedStartMetadata = {
    slackTeamId: input.slackTeamId,
    slackChannelId: input.slackChannelId,
    slackUserId: input.slackUserId,
  };

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
            element: { type: "plain_text_input", action_id: "value", multiline: true },
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
              initial_option: {
                text: {
                  type: "plain_text",
                  text:
                    modelOptionsFor(selectedTool).find((option) => option.value === selectedModel)
                      ?.label ?? selectedModel,
                },
                value: selectedModel,
              },
              options: slackSelectOptions(modelOptionsFor(selectedTool)),
            },
          },
          {
            type: "input",
            block_id: "reasoning",
            label: { type: "plain_text", text: "Thinking" },
            element: {
              type: "static_select",
              action_id: "value",
              initial_option: {
                text: {
                  type: "plain_text",
                  text:
                    reasoningOptionsFor(selectedTool).find(
                      (option) => option.value === selectedReasoning,
                    )?.label ?? selectedReasoning,
                },
                value: selectedReasoning,
              },
              options: slackSelectOptions(reasoningOptionsFor(selectedTool)),
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
        ],
      },
    })
    .catch((err: unknown) => {
      console.warn("[slack] failed to open advanced start modal:", errorMessage(err));
      return null;
    });
  return true;
}

function claimMentionEvent(teamId: string, channel: string, threadTs: string): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of recentMentionKeys) {
    if (expiresAt <= now) recentMentionKeys.delete(key);
  }

  const key = `${teamId}:${channel}:${threadTs}`;
  if (recentMentionKeys.has(key)) return false;
  recentMentionKeys.set(key, now + RECENT_MENTION_TTL_MS);
  return true;
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
  if (!claimMentionEvent(teamId, channel, threadTs)) {
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
    select: { id: true },
  });
  if (existingThread) {
    console.info("[slack] ignoring duplicate app_mention for existing thread", { teamId, channel, threadTs });
    return;
  }

  const account = await resolveSlackAccount(teamId, slackUserId);
  if (!account) {
    console.info("[slack] prompting unlinked Slack user", { teamId, slackUserId, channel, threadTs });
    await postLinkPrompt({
      slackTeamId: teamId,
      slackUserId,
      slackChannelId: channel,
      threadTs: event.thread_ts,
    });
    return;
  }
  const traceUserId = account.userId;

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

  const binding = await resolveSlackChannelBinding(teamId, channel);
  if (!binding || binding.organizationId !== install.organizationId) {
    await postBindPrompt({
      slackTeamId: teamId,
      slackChannelId: channel,
      slackUserId,
      threadTs,
      text: "This Slack channel is not bound to a Trace channel yet.",
    });
    return;
  }

  const rawText = typeof event.text === "string" ? event.text : "";
  const parsed = parseSlackPrompt(stripBotMention(rawText, install.botUserId));
  const prompt = parsed.prompt;
  if (!prompt) {
    const client = await getSlackClient(teamId);
    if (client) {
      await client.chat
        .postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text: "Mention `@trace` with a prompt, or use `/trace start` for advanced options.",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "Mention `@trace` with a prompt, or use `/trace start` for advanced options.",
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Preferences" },
                  url: buildPreferencesUrl(teamId, slackUserId),
                  action_id: "slack_preferences_open",
                },
              ],
            },
          ],
        })
        .catch(() => {});
    }
    return;
  }

  let session: Awaited<ReturnType<typeof sessionService.start>>;
  let settings: ReturnType<typeof resolveEffectiveSlackSettings>;
  try {
    settings = resolveEffectiveSlackSettings({ account, parsed });
  } catch (err: unknown) {
    const client = await getSlackClient(teamId);
    if (client) {
      await client.chat
        .postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text: errorMessage(err),
        })
        .catch(() => {});
    }
    return;
  }
  const { hosting } = settings;
  try {
    session = await sessionService.start({
      tool: settings.tool,
      model: settings.model ?? undefined,
      reasoningEffort: settings.reasoningEffort ?? undefined,
      organizationId: install.organizationId,
      createdById: traceUserId,
      channelId: binding.traceChannelId,
      hosting,
      prompt: hosting === "local" ? undefined : prompt,
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

  if (hosting === "local") {
    try {
      await sessionService.run(session.id, prompt, undefined, {
        userId: traceUserId,
        organizationId: install.organizationId,
        clientSource: "slack",
      });
    } catch (err: unknown) {
      const message = errorMessage(err);
      console.warn("[slack] failed to run local session prompt", {
        teamId,
        slackUserId,
        channel,
        threadTs,
        sessionId: session.id,
        error: message,
      });
      const client = await getSlackClient(teamId);
      if (client) {
        await client.chat
          .postEphemeral({
            channel,
            user: slackUserId,
            thread_ts: threadTs,
            text: `Could not send the prompt to the local Trace session: ${message}`,
          })
          .catch(() => {});
      }
    }
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
  tool: CodingTool;
  model: string | null;
  reasoningEffort: string | null;
  hosting: "cloud" | "local";
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

  const binding = await resolveSlackChannelBinding(
    metadata.slackTeamId,
    metadata.slackChannelId,
  );
  if (!binding || binding.organizationId !== install.organizationId) {
    throw new Error("This Slack channel is not bound to a Trace channel");
  }

  const settings = validateSlackSessionConfig({
    tool: input.tool,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
  });
  const threadTs = `${Date.now() / 1000}`;
  const session = await sessionService.start({
    tool: settings.tool,
    model: settings.model ?? undefined,
    reasoningEffort: settings.reasoningEffort ?? undefined,
    organizationId: install.organizationId,
    createdById: account.userId,
    channelId: binding.traceChannelId,
    hosting: input.hosting,
    prompt: input.hosting === "local" ? undefined : input.prompt,
    actorType: "user",
    clientSource: "slack",
  });

  const client = await getSlackClient(metadata.slackTeamId);
  const message = client
    ? await client.chat.postMessage({
        channel: metadata.slackChannelId,
        text: `🟢 Session started — \`${session.id.slice(0, 8)}\``,
      })
    : null;
  const slackThreadTs =
    typeof message?.ts === "string" && message.ts ? message.ts : threadTs;

  await prisma.slackThreadSession.create({
    data: {
      slackTeamId: metadata.slackTeamId,
      slackChannelId: metadata.slackChannelId,
      slackThreadTs,
      sessionId: session.id,
      organizationId: install.organizationId,
    },
  });

  slackEventBridge.attach(session.id, {
    slackTeamId: metadata.slackTeamId,
    slackChannelId: metadata.slackChannelId,
    slackThreadTs,
  });

  if (input.hosting === "local") {
    await sessionService.run(session.id, input.prompt, undefined, {
      userId: account.userId,
      organizationId: install.organizationId,
      clientSource: "slack",
    });
  }
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
        text: "Set your Trace Slack defaults.",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: "Set your Trace Slack account defaults." } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Preferences" }, url: buildPreferencesUrl(teamId, userId), action_id: "preferences" }] },
        ],
      });
      return;
    }

    res.status(200).json({
      response_type: "ephemeral",
      text: "Use `@trace <prompt>`, `@trace --model opus --think high <prompt>`, `/trace bind`, `/trace prefs`, or `/trace start`.",
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

    if (payload.type === "view_submission" && payload.view?.callback_id === "trace_advanced_start") {
      const prompt = getViewValue(payload, "prompt", "value")?.trim() ?? "";
      if (!prompt) {
        res.status(200).json({
          response_action: "errors",
          errors: { prompt: "Enter a prompt." },
        });
        return;
      }

      let metadata: AdvancedStartMetadata;
      try {
        metadata = JSON.parse(payload.view.private_metadata ?? "{}") as AdvancedStartMetadata;
      } catch {
        res.status(200).json({ response_action: "errors", errors: { prompt: "Invalid session metadata." } });
        return;
      }
      const tool = normalizeTool(getViewValue(payload, "tool", "value")) ?? "claude_code";
      const hostingValue = getViewValue(payload, "hosting", "value");
      const hosting = hostingValue === "local" ? "local" : "cloud";
      res.status(200).json({});
      void startSlackSessionFromModal({
        metadata,
        prompt,
        tool,
        model: getViewValue(payload, "model", "value"),
        reasoningEffort: getViewValue(payload, "reasoning", "value"),
        hosting,
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
