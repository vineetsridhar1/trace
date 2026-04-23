import { Router, type Router as RouterType, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import type { PushPlatform } from "@prisma/client";
import { prisma } from "../lib/db.js";
import {
  authenticateAccessToken,
  createBridgeAuthToken,
  getRequestToken,
  isExternalLocalModeRequest,
} from "../lib/auth.js";
import { isLocalMode } from "../lib/mode.js";
import {
  ensureLocalUserWorkspace,
  findMostRecentLocalUserWorkspace,
  getCanonicalLocalOrganizationId,
  normalizeLocalLoginName,
} from "../services/local-bootstrap.js";
import {
  createLocalMobilePairingToken,
  listLocalMobileDevices,
  LocalMobileAuthError,
  pairLocalMobileDevice,
  revokeLocalMobileDevice,
  revokeLocalMobileDeviceByToken,
} from "../services/local-mobile-auth.js";

const router: RouterType = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const WEB_URL = process.env.TRACE_WEB_URL || `http://localhost:${3000 + Number(process.env.TRACE_PORT || 0)}`;
const SERVER_PUBLIC_URL = process.env.TRACE_SERVER_PUBLIC_URL || WEB_URL;
const GITHUB_CALLBACK_URL = `${SERVER_PUBLIC_URL.replace(/\/$/, "")}/auth/github/callback`;

// Mobile uses ASWebAuthenticationSession which only terminates when the server
// redirects to a registered custom URL scheme. Web origins can't satisfy that
// requirement, so we recognise a sentinel origin value and swap the final
// redirect to the mobile scheme while the rest of the OAuth flow stays identical.
const MOBILE_ORIGIN = "trace-mobile";
const MOBILE_REDIRECT_URL = "trace://auth/callback";
const OAUTH_STATE_TTL_SECONDS = 5 * 60;
const EXTERNAL_LOCAL_MODE_AUTH_ERROR = "External local-mode access requires a paired mobile token";

type OAuthStatePayload = { origin: string; tokenType: "oauth_state" };

// Origins permitted on /auth/github and /auth/github/callback. The popup
// embeds this as the postMessage target — accepting arbitrary values would
// let an attacker-chosen origin receive the token.
export function getAllowedOAuthOrigins(): Set<string> {
  const origins = new Set<string>([WEB_URL, MOBILE_ORIGIN]);
  const extra = process.env.CORS_ALLOWED_ORIGINS;
  if (extra) {
    for (const value of extra.split(",")) {
      const trimmed = value.trim();
      if (trimmed) origins.add(trimmed);
    }
  }
  return origins;
}

function isAllowedOrigin(origin: string): boolean {
  return getAllowedOAuthOrigins().has(origin);
}

export function createOAuthStateToken(origin: string): string {
  return jwt.sign(
    { origin, tokenType: "oauth_state" } satisfies OAuthStatePayload,
    JWT_SECRET,
    { expiresIn: OAUTH_STATE_TTL_SECONDS },
  );
}

export function verifyOAuthStateToken(state: string): { origin: string } | null {
  try {
    const payload = jwt.verify(state, JWT_SECRET) as OAuthStatePayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "oauth_state" ||
      typeof payload.origin !== "string"
    ) {
      return null;
    }
    return { origin: payload.origin };
  } catch {
    return null;
  }
}

// Safely embed a string inside a <script> block. JSON.stringify handles
// quote/backslash/unicode escaping; the `<` / `>` / `&` escapes stop a
// pathological payload from closing the script tag.
function escapeJsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie("trace_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function readOrganizationIdHeader(req: Request): string | null {
  const rawOrgId = req.headers["x-organization-id"];
  const organizationId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
  return typeof organizationId === "string" && organizationId.trim()
    ? organizationId.trim()
    : null;
}

async function resolveAuthenticatedUser(req: Request): Promise<{
  token: string;
  auth: Exclude<Awaited<ReturnType<typeof authenticateAccessToken>>, null>;
} | null> {
  const token = getRequestToken(req);
  if (!token) return null;
  const auth = await authenticateAccessToken(token);
  if (!auth) return null;
  return { token, auth };
}

function rejectExternalLocalModeRequest(
  req: Request,
  res: Response,
  authenticated: Awaited<ReturnType<typeof resolveAuthenticatedUser>>,
): boolean {
  if (!isExternalLocalModeRequest(req)) {
    return false;
  }
  if (!authenticated) {
    res.status(401).json({ error: EXTERNAL_LOCAL_MODE_AUTH_ERROR });
    return true;
  }
  if (authenticated.auth.kind !== "local_mobile") {
    res.status(403).json({ error: EXTERNAL_LOCAL_MODE_AUTH_ERROR });
    return true;
  }
  return false;
}

async function resolveRequestedOrganizationId(
  userId: string,
  requestedOrgId: string | null,
): Promise<string | null> {
  if (isLocalMode()) {
    const canonicalOrgId = await getCanonicalLocalOrganizationId();
    if (!canonicalOrgId) return null;
    const membership = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: canonicalOrgId } },
      select: { organizationId: true },
    });
    return membership?.organizationId ?? null;
  }

  if (requestedOrgId) {
    const membership = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: requestedOrgId } },
      select: { organizationId: true },
    });
    return membership?.organizationId ?? null;
  }

  const firstMembership = await prisma.orgMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { organizationId: true },
  });
  return firstMembership?.organizationId ?? null;
}

function parsePushPlatform(value: unknown): PushPlatform | null {
  return value === "ios" || value === "android" ? value : null;
}

router.post("/auth/local/login", async (req: Request, res: Response) => {
  if (!isLocalMode()) {
    return res.status(404).json({ error: "Local login is only available in local mode" });
  }
  if (isExternalLocalModeRequest(req)) {
    return res.status(403).json({ error: "Local login is only available on localhost" });
  }

  const rawName = typeof req.body?.name === "string" ? req.body.name : "";
  const name = normalizeLocalLoginName(rawName);
  if (name.length > 0 && name.length < 2) {
    return res.status(400).json({ error: "Name must be at least 2 characters" });
  }
  const workspace =
    name.length >= 2
      ? await ensureLocalUserWorkspace(name)
      : await findMostRecentLocalUserWorkspace();
  if (!workspace) {
    return res.status(404).json({ error: "No saved local user found" });
  }

  const { user, organizationId } = workspace;
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
  setSessionCookie(res, token);
  res.json({
    token,
    organizationId,
    user,
  });
});

router.post("/auth/local-mobile/pairing-token", async (req: Request, res: Response) => {
  if (!isLocalMode()) {
    return res.status(404).json({ error: "Local mobile pairing is only available in local mode" });
  }

  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (authenticated.auth.kind !== "session") {
    return res.status(403).json({ error: "Pairing must be started from the local app" });
  }

  const organizationId = await resolveRequestedOrganizationId(
    authenticated.auth.userId,
    readOrganizationIdHeader(req),
  );
  if (!organizationId) {
    return res.status(403).json({ error: "No active organization found" });
  }

  const pairing = await createLocalMobilePairingToken({
    ownerUserId: authenticated.auth.userId,
    organizationId,
  });
  res.json(pairing);
});

router.post("/auth/local-mobile/pair", async (req: Request, res: Response) => {
  if (!isLocalMode()) {
    return res.status(404).json({ error: "Local mobile pairing is only available in local mode" });
  }

  const pairingToken = typeof req.body?.pairingToken === "string" ? req.body.pairingToken : "";
  const installId = typeof req.body?.installId === "string" ? req.body.installId : "";
  const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName : undefined;
  const appVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion : undefined;
  const platform = parsePushPlatform(req.body?.platform);

  try {
    const result = await pairLocalMobileDevice({
      pairingToken,
      installId,
      deviceName,
      appVersion,
      platform,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof LocalMobileAuthError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
});

router.get("/auth/local-mobile/devices", async (req: Request, res: Response) => {
  if (!isLocalMode()) {
    return res.status(404).json({ error: "Local mobile pairing is only available in local mode" });
  }

  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (authenticated.auth.kind !== "session") {
    return res.status(403).json({ error: "Paired devices can only be managed from the local app" });
  }

  const organizationId = await resolveRequestedOrganizationId(
    authenticated.auth.userId,
    readOrganizationIdHeader(req),
  );
  if (!organizationId) {
    return res.status(403).json({ error: "No active organization found" });
  }

  const devices = await listLocalMobileDevices({
    ownerUserId: authenticated.auth.userId,
    organizationId,
  });
  res.json({ devices });
});

router.delete("/auth/local-mobile/devices/:deviceId", async (req: Request, res: Response) => {
  if (!isLocalMode()) {
    return res.status(404).json({ error: "Local mobile pairing is only available in local mode" });
  }

  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (authenticated.auth.kind !== "session") {
    return res.status(403).json({ error: "Paired devices can only be managed from the local app" });
  }

  const organizationId = await resolveRequestedOrganizationId(
    authenticated.auth.userId,
    readOrganizationIdHeader(req),
  );
  if (!organizationId) {
    return res.status(403).json({ error: "No active organization found" });
  }
  const deviceId =
    typeof req.params.deviceId === "string" ? req.params.deviceId : req.params.deviceId?.[0] ?? "";
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  try {
    await revokeLocalMobileDevice({
      ownerUserId: authenticated.auth.userId,
      organizationId,
      deviceId,
    });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof LocalMobileAuthError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
});

// Redirect to GitHub OAuth
router.get("/auth/github", (req: Request, res: Response) => {
  if (isLocalMode()) {
    return res.status(404).json({ error: "GitHub auth is disabled in local mode" });
  }
  const origin = req.query.origin as string | undefined;
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
  });
  if (origin && isAllowedOrigin(origin)) {
    params.set("state", createOAuthStateToken(origin));
  }
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GitHub OAuth callback
router.get("/auth/github/callback", async (req: Request, res: Response) => {
  if (isLocalMode()) {
    return res.status(404).json({ error: "GitHub auth is disabled in local mode" });
  }
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  try {
    // Exchange code for access token
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

    // Fetch GitHub user profile
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

    // Fetch primary email if not public
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

    // Upsert user - find by githubId first, then by email
    let user = await prisma.user.findFirst({
      where: { OR: [{ githubId: ghUser.id }, { email }] },
    });

    if (user) {
      // Update GitHub fields
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
          name: ghUser.name || ghUser.login,
        },
      });
    } else {
      // New user — create account without any org membership.
      // Users must be explicitly invited to an organization.
      user = await prisma.user.create({
        data: {
          email,
          name: ghUser.name || ghUser.login,
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
        },
      });
    }

    // Issue JWT (only userId — org is selected via header)
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    setSessionCookie(res, token);

    const origin = resolveStateOrigin(req.query.state);

    if (origin === MOBILE_ORIGIN) {
      const target = new URL(MOBILE_REDIRECT_URL);
      target.searchParams.set("token", token);
      return res.redirect(302, target.toString());
    }

    const redirectOrigin = origin ?? WEB_URL;
    const tokenLiteral = escapeJsString(token);
    const originLiteral = escapeJsString(redirectOrigin);

    // Signal the opener window and close the popup.
    // Always store the token in localStorage first — window.opener can be
    // null after cross-origin navigation (GitHub OAuth redirect) in
    // Chromium/Electron, so postMessage alone is unreliable.  localStorage
    // is shared across same-origin windows, and the storage event plus
    // BroadcastChannel give the main window two independent fallback
    // signals that work even when the opener reference is severed.
    res.send(`<!DOCTYPE html><html><body><script>
      try { localStorage.setItem("trace_token", ${tokenLiteral}); } catch(e) {}
      try {
        var bc = new BroadcastChannel("trace_auth");
        bc.postMessage({ type: "auth:success", token: ${tokenLiteral} });
        bc.close();
      } catch(e) {}
      if (window.opener) {
        window.opener.postMessage({ type: "auth:success", token: ${tokenLiteral} }, ${originLiteral});
      }
      window.close();
    </script></body></html>`);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    const origin = resolveStateOrigin(req.query.state);
    if (origin === MOBILE_ORIGIN) {
      return res.redirect(302, `${MOBILE_REDIRECT_URL}?error=auth_failed`);
    }
    const errorOrigin = origin ?? WEB_URL;
    const errorOriginLiteral = escapeJsString(errorOrigin);
    res.send(`<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: "auth:error" }, ${errorOriginLiteral});
        window.close();
      } else {
        document.body.textContent = "Authentication failed";
      }
    </script></body></html>`);
  }
});

function resolveStateOrigin(rawState: unknown): string | null {
  if (typeof rawState !== "string" || rawState.length === 0) return null;
  const origin = verifyOAuthStateToken(rawState)?.origin ?? null;
  return origin && isAllowedOrigin(origin) ? origin : null;
}

// Get current user with org memberships
router.get("/auth/me", async (req: Request, res: Response) => {
  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: authenticated.auth.userId },
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

    const canonicalOrgId = isLocalMode() ? await getCanonicalLocalOrganizationId() : null;
    const orgMemberships =
      canonicalOrgId
        ? user.orgMemberships.filter((membership) => membership.organizationId === canonicalOrgId)
        : user.orgMemberships;

    // Include the session token so the client can store it in localStorage.
    // This is necessary when the user authenticated via httpOnly cookie
    // (e.g. after an OAuth popup where window.opener was severed) and the
    // client-side JS doesn't have the raw JWT for the desktop bridge.
    res.json({
      user: {
        ...user,
        orgMemberships,
      },
      token: authenticated.auth.kind === "session" ? authenticated.token : undefined,
    });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

router.get("/auth/bridge-token", async (req: Request, res: Response) => {
  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const organizationId = await resolveRequestedOrganizationId(
    authenticated.auth.userId,
    readOrganizationIdHeader(req),
  );
  if (!organizationId) {
    return res.status(403).json({ error: "No active organization found" });
  }
  if (
    !isLocalMode() &&
    authenticated.auth.kind === "local_mobile" &&
    authenticated.auth.organizationId !== organizationId
  ) {
    return res.status(403).json({ error: "This mobile device is not paired for that organization" });
  }

  const instanceId = typeof req.query.instanceId === "string" ? req.query.instanceId.trim() : "";
  if (!instanceId) {
    return res.status(400).json({ error: "instanceId is required" });
  }

  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: authenticated.auth.userId,
        organizationId,
      },
    },
    select: { userId: true },
  });
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this organization" });
  }

  const bridgeToken = createBridgeAuthToken({
    userId: authenticated.auth.userId,
    organizationId,
    instanceId,
  });
  res.json({
    token: bridgeToken.token,
    expiresAt: bridgeToken.expiresAt.toISOString(),
  });
});

// Logout
router.post("/auth/logout", async (req: Request, res: Response) => {
  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (authenticated?.auth.kind === "local_mobile") {
    await revokeLocalMobileDeviceByToken(authenticated.token);
  }
  res.clearCookie("trace_token", {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ ok: true });
});

export { router as authRouter };
