import { Router, type Router as RouterType, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import type { PushPlatform } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { redis } from "../lib/redis.js";
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
  createMobilePairingToken,
  listMobileDevices,
  MobileAuthError,
  pairMobileDevice,
  revokeMobileDevice,
  revokeMobileDeviceByToken,
} from "../services/mobile-auth.js";
import { pushTokenService } from "../services/pushTokenService.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";

const router: RouterType = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const JWT_SECRET = resolveJwtSecret();
const EXTERNAL_LOCAL_MODE_AUTH_ERROR = "External local-mode access requires a paired mobile token";
const GITHUB_DEVICE_SCOPE = "read:user user:email";
const GITHUB_DEVICE_AUTH_KEY_PREFIX = "auth:github-device:";

type GitHubDeviceAuth = {
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
};
type GitHubAccessTokenResponse = { access_token?: string; error?: string };
type GitHubUserResponse = {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
};
type GitHubEmailResponse = {
  email: string;
  primary: boolean;
  verified: boolean;
};

function logoutPushToken(req: Request): string | null {
  const body = req.body as unknown;
  if (!body || typeof body !== "object") return null;
  const token = (body as { pushToken?: unknown }).pushToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function getSessionCookieOptions(): CookieOptions {
  const sameSite = process.env.TRACE_AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
  const normalizedSameSite =
    sameSite === "strict" || sameSite === "lax" || sameSite === "none" ? sameSite : "lax";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: normalizedSameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie("trace_token", token, getSessionCookieOptions());
}

async function upsertUserFromGitHubAccessToken(accessToken: string) {
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const ghUser = (await userRes.json()) as GitHubUserResponse;

  let email = ghUser.email;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const emails = (await emailsRes.json()) as GitHubEmailResponse[];
    const primary = emails.find((e) => e.primary && e.verified);
    email = primary?.email ?? emails[0]?.email ?? null;
  }

  if (!email) {
    throw new Error("Could not retrieve email from GitHub");
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

  return user;
}

function readOrganizationIdHeader(req: Request): string | null {
  const rawOrgId = req.headers["x-organization-id"];
  const organizationId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
  return typeof organizationId === "string" && organizationId.trim() ? organizationId.trim() : null;
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
  if (authenticated.auth.kind !== "mobile") {
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
    organizationId,
    user,
  });
});

async function createMobilePairingTokenForRequest(req: Request, res: Response): Promise<void> {
  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (authenticated.auth.kind !== "session") {
    res.status(403).json({ error: "Pairing must be started from a signed-in desktop or web app" });
    return;
  }

  const organizationId = await resolveRequestedOrganizationId(
    authenticated.auth.userId,
    readOrganizationIdHeader(req),
  );
  if (!organizationId) {
    res.status(403).json({ error: "No active organization found" });
    return;
  }

  const pairing = await createMobilePairingToken({
    ownerUserId: authenticated.auth.userId,
    organizationId,
  });
  res.json(pairing);
}

router.post("/auth/mobile/pairing-token", async (req: Request, res: Response) => {
  await createMobilePairingTokenForRequest(req, res);
});

async function pairMobileDeviceForRequest(req: Request, res: Response): Promise<void> {
  const pairingToken = typeof req.body?.pairingToken === "string" ? req.body.pairingToken : "";
  const installId = typeof req.body?.installId === "string" ? req.body.installId : "";
  const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName : undefined;
  const appVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion : undefined;
  const platform = parsePushPlatform(req.body?.platform);

  try {
    const result = await pairMobileDevice({
      pairingToken,
      installId,
      deviceName,
      appVersion,
      platform,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof MobileAuthError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
}

router.post("/auth/mobile/pair", async (req: Request, res: Response) => {
  await pairMobileDeviceForRequest(req, res);
});

async function listMobileDevicesForRequest(req: Request, res: Response): Promise<void> {
  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (authenticated.auth.kind !== "session") {
    res.status(403).json({ error: "Paired devices can only be managed from desktop or web" });
    return;
  }

  const organizationId = await resolveRequestedOrganizationId(
    authenticated.auth.userId,
    readOrganizationIdHeader(req),
  );
  if (!organizationId) {
    res.status(403).json({ error: "No active organization found" });
    return;
  }

  const devices = await listMobileDevices({
    ownerUserId: authenticated.auth.userId,
    organizationId,
  });
  res.json({ devices });
}

router.get("/auth/mobile/devices", async (req: Request, res: Response) => {
  await listMobileDevicesForRequest(req, res);
});

async function revokeMobileDeviceForRequest(req: Request, res: Response): Promise<void> {
  const authenticated = await resolveAuthenticatedUser(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (!authenticated) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (authenticated.auth.kind !== "session") {
    res.status(403).json({ error: "Paired devices can only be managed from desktop or web" });
    return;
  }

  const organizationId = await resolveRequestedOrganizationId(
    authenticated.auth.userId,
    readOrganizationIdHeader(req),
  );
  if (!organizationId) {
    res.status(403).json({ error: "No active organization found" });
    return;
  }
  const deviceId =
    typeof req.params.deviceId === "string"
      ? req.params.deviceId
      : (req.params.deviceId?.[0] ?? "");
  if (!deviceId) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }

  try {
    await revokeMobileDevice({
      ownerUserId: authenticated.auth.userId,
      organizationId,
      deviceId,
    });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof MobileAuthError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
}

router.delete("/auth/mobile/devices/:deviceId", async (req: Request, res: Response) => {
  await revokeMobileDeviceForRequest(req, res);
});

function githubDeviceAuthKey(deviceAuthId: string): string {
  return `${GITHUB_DEVICE_AUTH_KEY_PREFIX}${deviceAuthId}`;
}

function gitHubDeviceAuthTtlSeconds(record: GitHubDeviceAuth, now = Date.now()): number {
  return Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
}

function parseGitHubDeviceAuth(raw: string | null): GitHubDeviceAuth | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GitHubDeviceAuth>;
    if (
      typeof parsed.deviceCode !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.intervalSeconds !== "number"
    ) {
      return null;
    }
    return {
      deviceCode: parsed.deviceCode,
      expiresAt: parsed.expiresAt,
      intervalSeconds: parsed.intervalSeconds,
    };
  } catch {
    return null;
  }
}

async function saveGitHubDeviceAuth(deviceAuthId: string, record: GitHubDeviceAuth): Promise<void> {
  await redis.set(
    githubDeviceAuthKey(deviceAuthId),
    JSON.stringify(record),
    "EX",
    gitHubDeviceAuthTtlSeconds(record),
  );
}

async function readGitHubDeviceAuth(deviceAuthId: string): Promise<GitHubDeviceAuth | null> {
  const key = githubDeviceAuthKey(deviceAuthId);
  const record = parseGitHubDeviceAuth(await redis.get(key));
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    await redis.del(key);
    return null;
  }
  return record;
}

async function deleteGitHubDeviceAuth(deviceAuthId: string): Promise<void> {
  await redis.del(githubDeviceAuthKey(deviceAuthId));
}

function readDeviceAuthId(req: Request): string {
  const value = req.body?.deviceAuthId;
  return typeof value === "string" ? value.trim() : "";
}

router.post("/auth/github/device/start", async (_req: Request, res: Response) => {
  if (isLocalMode()) {
    return res.status(404).json({ error: "GitHub auth is disabled in local mode" });
  }

  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_DEVICE_SCOPE,
    }),
  });
  const payload = (await response.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
    error_description?: string;
  };

  if (
    !response.ok ||
    !payload.device_code ||
    !payload.user_code ||
    !payload.verification_uri ||
    typeof payload.expires_in !== "number"
  ) {
    return res.status(400).json({
      error: payload.error_description ?? payload.error ?? "Failed to start GitHub device login",
    });
  }

  const deviceAuthId = randomUUID();
  const intervalSeconds =
    typeof payload.interval === "number" && payload.interval > 0 ? payload.interval : 5;
  const expiresAt = Date.now() + payload.expires_in * 1000;
  await saveGitHubDeviceAuth(deviceAuthId, {
    deviceCode: payload.device_code,
    expiresAt,
    intervalSeconds,
  });

  res.json({
    deviceAuthId,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    expiresAt: new Date(expiresAt).toISOString(),
    interval: intervalSeconds,
  });
});

router.post("/auth/github/device/poll", async (req: Request, res: Response) => {
  if (isLocalMode()) {
    return res.status(404).json({ error: "GitHub auth is disabled in local mode" });
  }

  const deviceAuthId = readDeviceAuthId(req);
  const record = deviceAuthId ? await readGitHubDeviceAuth(deviceAuthId) : null;
  if (!record) {
    return res.status(404).json({ status: "expired", error: "GitHub device login expired" });
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      device_code: record.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const payload = (await response.json()) as GitHubAccessTokenResponse;

  if (payload.error === "authorization_pending") {
    return res.json({ status: "pending", interval: record.intervalSeconds });
  }

  if (payload.error === "slow_down") {
    record.intervalSeconds += 5;
    await saveGitHubDeviceAuth(deviceAuthId, record);
    return res.json({ status: "pending", interval: record.intervalSeconds });
  }

  if (payload.error === "expired_token") {
    await deleteGitHubDeviceAuth(deviceAuthId);
    return res.status(410).json({ status: "expired", error: "GitHub device login expired" });
  }

  if (payload.error === "access_denied") {
    await deleteGitHubDeviceAuth(deviceAuthId);
    return res.status(403).json({ status: "denied", error: "GitHub device login was denied" });
  }

  if (!payload.access_token) {
    return res.status(400).json({ status: "error", error: payload.error ?? "GitHub login failed" });
  }

  const user = await upsertUserFromGitHubAccessToken(payload.access_token);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  setSessionCookie(res, token);
  await deleteGitHubDeviceAuth(deviceAuthId);

  res.json({ status: "success" });
});

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
    const orgMemberships = canonicalOrgId
      ? user.orgMemberships.filter((membership) => membership.organizationId === canonicalOrgId)
      : user.orgMemberships;

    res.json({
      user: {
        ...user,
        orgMemberships,
      },
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
    authenticated.auth.kind === "mobile" &&
    authenticated.auth.organizationId !== organizationId
  ) {
    return res
      .status(403)
      .json({ error: "This mobile device is not paired for that organization" });
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
  const pushToken = logoutPushToken(req);
  if (rejectExternalLocalModeRequest(req, res, authenticated)) {
    return;
  }
  if (authenticated?.auth.kind === "mobile") {
    await revokeMobileDeviceByToken(authenticated.token);
  }
  if (authenticated && pushToken) {
    await pushTokenService.unregister({ userId: authenticated.auth.userId, token: pushToken });
  }
  const { maxAge: _maxAge, ...cookieOptions } = getSessionCookieOptions();
  res.clearCookie("trace_token", cookieOptions);
  res.json({ ok: true });
});

export { router as authRouter };
