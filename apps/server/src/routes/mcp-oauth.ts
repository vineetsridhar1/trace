import { Router, type Router as RouterType, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { authenticateAccessToken, getRequestToken } from "../lib/auth.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { mcpServerService } from "../services/mcp-server.js";
import { mcpConnectionService } from "../services/mcp-connection.js";
import { getMcpCatalogEntry } from "../lib/mcp-catalog.js";
import {
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  mcpRedirectUri,
} from "../lib/mcp-oauth.js";

const JWT_SECRET = resolveJwtSecret();
const STATE_TTL_SECONDS = 10 * 60;

/**
 * The OAuth `state` is a signed, short-lived JWT (stateless, mirroring the
 * Slack install flow). The PKCE verifier is encrypted (AES-256-GCM) before
 * being embedded so it never travels in plaintext through the browser or the
 * authorization server — preserving PKCE's protection without a server-side
 * verifier store.
 */
interface McpStatePayload {
  mcpServerId: string;
  userId: string;
  organizationId: string;
  ev: string; // encrypted code_verifier
  eiv: string; // iv for the encrypted verifier
  tokenType: "mcp_oauth";
}

function signState(payload: Omit<McpStatePayload, "tokenType">): string {
  return jwt.sign({ ...payload, tokenType: "mcp_oauth" } satisfies McpStatePayload, JWT_SECRET, {
    expiresIn: STATE_TTL_SECONDS,
  });
}

function verifyState(token: string): McpStatePayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as McpStatePayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "mcp_oauth" ||
      typeof payload.mcpServerId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.ev !== "string" ||
      typeof payload.eiv !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

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
  )}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0b0e;color:#e6e6ea;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{max-width:480px;padding:32px;background:#15151a;border-radius:12px;border:1px solid #2a2a31;text-align:center}h1{margin:0 0 12px;font-size:20px}p{color:#9c9caa;line-height:1.5;margin:0 0 16px}</style></head><body><div class="card">${body}</div><script>setTimeout(function(){window.close()},2500)</script></body></html>`;
}

async function readAuthenticatedUserId(req: Request): Promise<string | null> {
  const token = getRequestToken(req);
  if (!token) return null;
  const subject = await authenticateAccessToken(token);
  return subject?.userId ?? null;
}

const router: RouterType = Router();

router.get("/:serverId/oauth/start", async (req: Request, res: Response) => {
  const serverId = typeof req.params.serverId === "string" ? req.params.serverId : "";

  const userId = await readAuthenticatedUserId(req);
  if (!userId) {
    res
      .status(401)
      .send(renderHtml("Connect MCP", "<h1>Not signed in</h1><p>Sign in to Trace, then retry.</p>"));
    return;
  }

  const server = await prisma.mcpServer.findUnique({ where: { id: serverId } });
  if (!server || !server.enabled) {
    res.status(404).send(renderHtml("Connect MCP", "<h1>Not found</h1><p>Unknown MCP server.</p>"));
    return;
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId: server.organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    res
      .status(403)
      .send(renderHtml("Connect MCP", "<h1>Not a member</h1><p>You can't connect this server.</p>"));
    return;
  }

  try {
    const { metadata, clientId } = await mcpServerService.resolveOAuthContext(serverId);
    const pkce = generatePkce();
    const encryptedVerifier = encryptSecret(pkce.verifier);
    const state = signState({
      mcpServerId: serverId,
      userId,
      organizationId: server.organizationId,
      ev: encryptedVerifier.encrypted,
      eiv: encryptedVerifier.iv,
    });
    const authorizeUrl = buildAuthorizeUrl({
      metadata,
      clientId,
      redirectUri: mcpRedirectUri(),
      state,
      codeChallenge: pkce.challenge,
      scope: getMcpCatalogEntry(server.catalogId)?.scope,
    });
    res.redirect(authorizeUrl);
  } catch (err) {
    console.error("[mcp-oauth] start failed:", (err as Error).message);
    res
      .status(502)
      .send(renderHtml("Connect MCP", "<h1>Couldn't start</h1><p>OAuth discovery failed.</p>"));
  }
});

router.get("/oauth/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !stateRaw) {
    res
      .status(400)
      .send(renderHtml("Connect MCP", "<h1>Invalid callback</h1><p>Missing code or state.</p>"));
    return;
  }
  const state = verifyState(stateRaw);
  if (!state) {
    res
      .status(400)
      .send(renderHtml("Connect MCP", "<h1>Invalid state</h1><p>The link expired. Retry.</p>"));
    return;
  }

  try {
    const { metadata, clientId, clientSecret } = await mcpServerService.resolveOAuthContext(
      state.mcpServerId,
    );
    const codeVerifier = decryptSecret(state.ev, state.eiv);
    const tokens = await exchangeCode({
      metadata,
      clientId,
      clientSecret,
      code,
      redirectUri: mcpRedirectUri(),
      codeVerifier,
    });
    await mcpConnectionService.upsertTokens(state.userId, state.mcpServerId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });
    res
      .status(200)
      .send(renderHtml("Connect MCP", "<h1>Connected</h1><p>You can close this window.</p>"));
  } catch (err) {
    console.error("[mcp-oauth] callback failed:", (err as Error).message);
    res
      .status(400)
      .send(renderHtml("Connect MCP", "<h1>OAuth failed</h1><p>Could not complete the connection.</p>"));
  }
});

export const mcpOAuthRouter: RouterType = router;
