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
import { orgMemberService } from "../services/org-member.js";
import { AUTO_JOIN_GITHUB_ORG, isGitHubOrgMember } from "../lib/github-org.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";

const router: RouterType = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
// Trace is hosted only for opendoor, so login requests read:org to detect
// membership of AUTO_JOIN_GITHUB_ORG and auto-add those users to the organization.
const GITHUB_LOGIN_SCOPE = "read:org";
const JWT_SECRET = resolveJwtSecret();
const EXTERNAL_LOCAL_MODE_AUTH_ERROR = "External local-mode access requires a paired mobile token";
const GITHUB_DEVICE_AUTH_KEY_PREFIX = "auth:github-device:";
const RATE_LIMIT_KEY_PREFIX = "auth:rate";
const localRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

class TTLStore<T> {
  private readonly records = new Map<string, { value: T; expiresAt: number }>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs: number) {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  set(key: string, value: T, ttlSeconds: number): void {
    this.records.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  get(key: string): T | null {
    const record = this.records.get(key);
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.records.delete(key);
      return null;
    }
    return record.value;
  }

  delete(key: string): void {
    this.records.delete(key);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
      }
    }
  }
}

type GitHubDeviceAuth = {
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
};
type GitHubAccessTokenResponse = { access_token?: string; error?: string; scope?: string };
type GitHubUserResponse = {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
};
type RateLimitConfig = {
  keyPrefix: string;
  max: number;
  windowSeconds: number;
};

const githubDeviceStartRateLimit: RateLimitConfig = {
  keyPrefix: "github-device-start",
  max: 10,
  windowSeconds: 60,
};
const githubDevicePollIpRateLimit: RateLimitConfig = {
  keyPrefix: "github-device-poll-ip",
  max: 120,
  windowSeconds: 60,
};
const githubDevicePollRecordRateLimit: RateLimitConfig = {
  keyPrefix: "github-device-poll-record",
  max: 30,
  windowSeconds: 60,
};
const mobilePairRateLimit: RateLimitConfig = {
  keyPrefix: "mobile-pair",
  max: 30,
  windowSeconds: 60,
};
const localGitHubDeviceAuthRecords = new TTLStore<GitHubDeviceAuth>(60_000);

function preventAuthResponseCaching(req: Request, res: Response) {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
}

function githubOAuthGrantUrl(): string {
  return `https://github.com/settings/connections/applications/${GITHUB_CLIENT_ID}`;
}

async function revokeGitHubOAuthGrant(accessToken: string): Promise<boolean> {
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientSecret) return false;

  const response = await fetch(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/grant`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${Buffer.from(`${GITHUB_CLIENT_ID}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  return response.ok;
}

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

function readFirstHeader(req: Request, headerName: string): string | null {
  const value = req.headers[headerName.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function rateLimitClientKey(req: Request): string {
  const forwardedFor = readFirstHeader(req, "x-forwarded-for");
  const forwardedClient = forwardedFor?.split(",")[0]?.trim();
  return forwardedClient || req.ip || req.socket.remoteAddress || "unknown";
}

function applyLocalRateLimit(
  key: string,
  config: RateLimitConfig,
): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = localRateLimitBuckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + config.windowSeconds * 1000 };
  bucket.count += 1;
  localRateLimitBuckets.set(key, bucket);
  return {
    limited: bucket.count > config.max,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

async function consumeRateLimit(
  req: Request,
  res: Response,
  config: RateLimitConfig,
  subject = rateLimitClientKey(req),
): Promise<boolean> {
  const key = `${RATE_LIMIT_KEY_PREFIX}:${config.keyPrefix}:${subject}`;
  let limited = false;
  let retryAfter = config.windowSeconds;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, config.windowSeconds);
    }
    limited = count > config.max;
    if (limited) {
      const ttl = await redis.ttl(key);
      retryAfter = ttl > 0 ? ttl : config.windowSeconds;
    }
  } catch {
    const fallback = applyLocalRateLimit(key, config);
    limited = fallback.limited;
    retryAfter = fallback.retryAfter;
  }

  if (!limited) return false;
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ error: "Too many requests" });
  return true;
}

function isGitHubUserResponse(value: unknown): value is GitHubUserResponse {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<GitHubUserResponse>;
  return (
    typeof user.id === "number" &&
    typeof user.login === "string" &&
    (typeof user.email === "string" || user.email === null) &&
    typeof user.avatar_url === "string" &&
    (typeof user.name === "string" || user.name === null)
  );
}

async function upsertUserFromGitHubAccessToken(accessToken: string) {
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const ghUser = (await userRes.json().catch(() => null)) as unknown;
  if (!userRes.ok || !isGitHubUserResponse(ghUser)) {
    throw new Error("Could not verify GitHub identity");
  }
  const email = `github-${ghUser.id}@trace.local`;

  let user = await prisma.user.findUnique({
    where: { githubId: ghUser.id },
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

// Auto-add members of the configured GitHub org to the Trace organization on login.
// Failures here never block login — the user just isn't auto-added.
async function autoJoinOrganizationIfMember(userId: string, accessToken: string): Promise<void> {
  try {
    if (!(await isGitHubOrgMember(accessToken, AUTO_JOIN_GITHUB_ORG))) return;

    const organization = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!organization) return;

    const existing = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: organization.id } },
      select: { userId: true },
    });
    if (existing) return;

    await orgMemberService.addMember({
      organizationId: organization.id,
      userId,
      actorType: "system",
      actorId: "system",
    });
  } catch (error) {
    console.error("[auth] Failed to auto-join organization:", (error as Error).message);
  }
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
  if (
    await consumeRateLimit(
      req,
      res,
      mobilePairRateLimit,
      `${rateLimitClientKey(req)}:${installId || "missing"}`,
    )
  ) {
    return;
  }

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

  const devices = await listMobileDevices({
    ownerUserId: authenticated.auth.userId,
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

function saveLocalGitHubDeviceAuth(deviceAuthId: string, record: GitHubDeviceAuth): void {
  localGitHubDeviceAuthRecords.set(deviceAuthId, record, gitHubDeviceAuthTtlSeconds(record));
}

function readLocalGitHubDeviceAuth(deviceAuthId: string): GitHubDeviceAuth | null {
  return localGitHubDeviceAuthRecords.get(deviceAuthId);
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
  try {
    await redis.set(
      githubDeviceAuthKey(deviceAuthId),
      JSON.stringify(record),
      "EX",
      gitHubDeviceAuthTtlSeconds(record),
    );
  } catch (error) {
    console.warn(
      "[auth] falling back to local GitHub device auth storage:",
      (error as Error).message,
    );
    saveLocalGitHubDeviceAuth(deviceAuthId, record);
  }
}

async function readGitHubDeviceAuth(deviceAuthId: string): Promise<GitHubDeviceAuth | null> {
  const key = githubDeviceAuthKey(deviceAuthId);
  let record: GitHubDeviceAuth | null = null;
  try {
    record = parseGitHubDeviceAuth(await redis.get(key));
  } catch (error) {
    console.warn("[auth] reading local GitHub device auth storage:", (error as Error).message);
  }
  record ??= readLocalGitHubDeviceAuth(deviceAuthId);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    localGitHubDeviceAuthRecords.delete(deviceAuthId);
    await redis.del(key).catch(() => undefined);
    return null;
  }
  return record;
}

async function deleteGitHubDeviceAuth(deviceAuthId: string): Promise<void> {
  localGitHubDeviceAuthRecords.delete(deviceAuthId);
  await redis.del(githubDeviceAuthKey(deviceAuthId)).catch(() => undefined);
}

function readDeviceAuthId(req: Request): string {
  const value = req.body?.deviceAuthId;
  return typeof value === "string" ? value.trim() : "";
}

async function readJsonResponse(response: globalThis.Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isGitHubDeviceCodeResponse(value: unknown): value is {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
} {
  return Boolean(value && typeof value === "object");
}

router.post("/auth/github/device/start", async (req: Request, res: Response) => {
  if (isLocalMode()) {
    return res.status(404).json({ error: "GitHub auth is disabled in local mode" });
  }
  if (await consumeRateLimit(req, res, githubDeviceStartRateLimit)) {
    return;
  }

  let response: globalThis.Response;
  try {
    response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_LOGIN_SCOPE,
      }),
    });
  } catch (error) {
    console.error("[auth] GitHub device code request failed:", (error as Error).message);
    return res.status(502).json({ error: "Could not reach GitHub login. Try again." });
  }

  const rawPayload = await readJsonResponse(response);
  const payload = isGitHubDeviceCodeResponse(rawPayload) ? rawPayload : {};

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
  if (await consumeRateLimit(req, res, githubDevicePollIpRateLimit)) {
    return;
  }

  const deviceAuthId = readDeviceAuthId(req);
  if (
    deviceAuthId &&
    (await consumeRateLimit(req, res, githubDevicePollRecordRateLimit, deviceAuthId))
  ) {
    return;
  }
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

  const grantedScopes = (payload.scope ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  // Require exactly read:org. A missing scope (e.g. a returning user's old
  // scopeless grant) would silently fail the membership check, so force re-auth
  // rather than proceeding to a guaranteed-failed auto-join.
  const hasExactLoginScope =
    grantedScopes.length === 1 && grantedScopes[0] === GITHUB_LOGIN_SCOPE;
  if (!hasExactLoginScope) {
    const revoked = await revokeGitHubOAuthGrant(payload.access_token);
    await deleteGitHubDeviceAuth(deviceAuthId);
    return res.status(400).json({
      status: "error",
      error: revoked
        ? "Removed old GitHub permissions for Trace. Start GitHub login again."
        : `GitHub still has old permissions for Trace. Revoke Trace at ${githubOAuthGrantUrl()}, then try again.`,
    });
  }

  let user: Awaited<ReturnType<typeof upsertUserFromGitHubAccessToken>>;
  try {
    user = await upsertUserFromGitHubAccessToken(payload.access_token);
  } catch {
    await deleteGitHubDeviceAuth(deviceAuthId);
    return res.status(400).json({
      status: "error",
      error: "Could not verify GitHub identity. Start GitHub login again.",
    });
  }
  await autoJoinOrganizationIfMember(user.id, payload.access_token);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  setSessionCookie(res, token);
  await deleteGitHubDeviceAuth(deviceAuthId);

  res.json({ status: "success" });
});

// Get current user with org memberships
router.get("/auth/me", async (req: Request, res: Response) => {
  preventAuthResponseCaching(req, res);

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
        defaultSessionTool: true,
        defaultSessionModel: true,
        defaultSessionReasoningEffort: true,
        autoArchiveMergedSessions: true,
        enableClaudeInChrome: true,
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
    localMode: isLocalMode(),
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
