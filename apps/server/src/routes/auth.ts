import crypto from "crypto";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db.js";
import { resolveJwtSecret } from "../lib/auth-config.js";
import { revokeToken } from "../lib/token-revocation.js";
import { rateLimit } from "../lib/rate-limit.js";
import {
  createBridgeAuthToken,
  getRequestToken,
  verifyTokenAsync,
} from "../lib/auth.js";

const router: RouterType = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const JWT_SECRET = resolveJwtSecret();
const WEB_URL = process.env.TRACE_WEB_URL || `http://localhost:${3000 + Number(process.env.TRACE_PORT || 0)}`;
const SERVER_PUBLIC_URL = process.env.TRACE_SERVER_PUBLIC_URL || WEB_URL;
const GITHUB_CALLBACK_URL = `${SERVER_PUBLIC_URL.replace(/\/$/, "")}/auth/github/callback`;

const OAUTH_STATE_COOKIE = "trace_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? "";
  const explicit = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = new Set([WEB_URL]);
  for (const origin of explicit) defaults.add(origin);
  return Array.from(defaults);
}

function isAllowedOrigin(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const allow = parseAllowedOrigins();
  try {
    const url = new URL(candidate);
    const normalized = `${url.protocol}//${url.host}`;
    return allow.some((a) => {
      try {
        const au = new URL(a);
        return `${au.protocol}//${au.host}` === normalized;
      } catch {
        return a === candidate;
      }
    });
  } catch {
    return false;
  }
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.get("x-forwarded-proto");
  if (proto && proto.split(",")[0].trim() === "https") return true;
  return false;
}

function cookieOptions(req: Request) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
  };
}

const authStartLimiter = rateLimit({ name: "auth:start", max: 20, windowSeconds: 60 });
const authCallbackLimiter = rateLimit({ name: "auth:callback", max: 20, windowSeconds: 60 });
const authMeLimiter = rateLimit({ name: "auth:me", max: 120, windowSeconds: 60 });
const authLogoutLimiter = rateLimit({ name: "auth:logout", max: 20, windowSeconds: 60 });
const authBridgeTokenLimiter = rateLimit({
  name: "auth:bridge-token",
  max: 60,
  windowSeconds: 60,
});

// Redirect to GitHub OAuth
router.get("/auth/github", authStartLimiter, (req: Request, res: Response) => {
  const origin = req.query.origin as string | undefined;
  const safeOrigin = isAllowedOrigin(origin) ? origin! : WEB_URL;

  // Random, single-use state bound to the browser session via httpOnly cookie.
  const nonce = crypto.randomBytes(32).toString("hex");
  const stateValue = `${nonce}.${Buffer.from(safeOrigin).toString("base64url")}`;

  res.cookie(OAUTH_STATE_COOKIE, nonce, {
    ...cookieOptions(req),
    maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
    state: stateValue,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

function decodeState(state: string): { nonce: string; origin: string } | null {
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const nonce = state.slice(0, dot);
  const encodedOrigin = state.slice(dot + 1);
  try {
    const origin = Buffer.from(encodedOrigin, "base64url").toString();
    return { nonce, origin };
  } catch {
    return null;
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function escapeForJsString(value: string): string {
  // Safe inline-script embedding: JSON.stringify escapes everything except </,
  // which could break out of the script tag.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function renderCallbackSuccess(res: Response, redirectOrigin: string, token: string) {
  const safeOrigin = isAllowedOrigin(redirectOrigin) ? redirectOrigin : WEB_URL;
  const originJson = escapeForJsString(safeOrigin);
  const tokenJson = escapeForJsString(token);
  // The state nonce already proves this callback was initiated by the
  // browser holding the cookie, so only the legitimate opener reaches this
  // HTML. Tight CSP + a restrictive script + targetOrigin on postMessage
  // keep the token from crossing origins.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'",
  );
  res.send(`<!DOCTYPE html><html><body><script>
  (function(){
    var origin = ${originJson};
    var token = ${tokenJson};
    try { localStorage.setItem("trace_token", token); } catch(e) {}
    try {
      var bc = new BroadcastChannel("trace_auth");
      bc.postMessage({ type: "auth:success", token: token });
      bc.close();
    } catch(e) {}
    if (window.opener) {
      try { window.opener.postMessage({ type: "auth:success", token: token }, origin); } catch(e) {}
    }
    window.close();
  })();
</script></body></html>`);
}

function renderCallbackError(res: Response, redirectOrigin: string) {
  const safeOrigin = isAllowedOrigin(redirectOrigin) ? redirectOrigin : WEB_URL;
  const originJson = escapeForJsString(safeOrigin);
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'",
  );
  res.send(`<!DOCTYPE html><html><body><script>
  (function(){
    var origin = ${originJson};
    if (window.opener) {
      try { window.opener.postMessage({ type: "auth:error" }, origin); } catch(e) {}
      window.close();
    } else {
      window.location.href = origin;
    }
  })();
</script></body></html>`);
}

router.get("/auth/github/callback", authCallbackLimiter, async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing code parameter" });
  }
  if (!state || typeof state !== "string") {
    return res.status(400).json({ error: "Missing state parameter" });
  }

  const decoded = decodeState(state);
  const cookieNonce = req.cookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions(req));

  if (!decoded || !cookieNonce || !timingSafeEqualString(decoded.nonce, cookieNonce)) {
    return res.status(400).json({ error: "Invalid state parameter" });
  }

  const redirectOrigin = isAllowedOrigin(decoded.origin) ? decoded.origin : WEB_URL;

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
      return res.status(400).json({ error: "Failed to get access token" });
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const ghUser = (await userRes.json()) as {
      id: number;
      login: string;
      email: string | null;
      avatar_url: string;
      name: string | null;
    };

    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email ?? emails[0]?.email ?? null;
    }

    if (!email) {
      return res.status(400).json({ error: "Could not retrieve email from GitHub" });
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ githubId: ghUser.id }, { email }] },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
          name: ghUser.name || ghUser.login,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name: ghUser.name || ghUser.login,
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
        },
      });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign({ userId: user.id, jti }, JWT_SECRET, {
      expiresIn: "7d",
      jwtid: jti,
    });

    res.cookie("trace_token", token, {
      ...cookieOptions(req),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return renderCallbackSuccess(res, redirectOrigin, token);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    return renderCallbackError(res, redirectOrigin);
  }
});

router.get("/auth/me", authMeLimiter, async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = await verifyTokenAsync(token);
  if (!userId) {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        orgMemberships: {
          select: {
            organizationId: true,
            role: true,
            joinedAt: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Include the session token so the client can store it in localStorage.
    // Necessary when the user authenticated via httpOnly cookie (OAuth popup
    // where window.opener was severed) and client-side JS doesn't already
    // have the raw JWT for the desktop bridge.
    res.json({ user, token });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

router.get("/auth/bridge-token", authBridgeTokenLimiter, async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  const userId = token ? await verifyTokenAsync(token) : null;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const rawOrgId = req.headers["x-organization-id"];
  const organizationId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    return res.status(400).json({ error: "Missing X-Organization-Id header" });
  }

  const instanceId = typeof req.query.instanceId === "string" ? req.query.instanceId.trim() : "";
  if (!instanceId) {
    return res.status(400).json({ error: "instanceId is required" });
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this organization" });
  }

  const bridgeToken = createBridgeAuthToken({ userId, organizationId, instanceId });
  res.json({
    token: bridgeToken.token,
    expiresAt: bridgeToken.expiresAt.toISOString(),
  });
});

router.post("/auth/logout", authLogoutLimiter, async (req: Request, res: Response) => {
  const token = getRequestToken(req);

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as {
        jti?: string;
        exp?: number;
      };
      if (payload.jti) {
        await revokeToken(payload.jti, payload.exp);
      }
    } catch {
      // Token could not be parsed; cookie is cleared below.
    }
  }

  res.clearCookie("trace_token", cookieOptions(req));
  res.json({ ok: true });
});

export { router as authRouter };
