import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  const base = createPrismaMock();
  return {
    prisma: {
      ...base,
      user: {
        ...base.user,
        create: vi.fn(),
        update: vi.fn(),
      },
      channel: {
        ...base.channel,
        deleteMany: vi.fn(),
      },
    },
  };
});

import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { isLoopbackAddress } from "../lib/auth.js";
import {
  authRouter,
  createOAuthStateToken,
  getAllowedOAuthOrigins,
  verifyOAuthStateToken,
} from "./auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
type PrismaMock = ReturnType<typeof import("../../test/helpers.js").createPrismaMock> & {
  user: ReturnType<typeof import("../../test/helpers.js").createPrismaMock>["user"] & {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  channel: ReturnType<typeof import("../../test/helpers.js").createPrismaMock>["channel"] & {
    deleteMany: ReturnType<typeof vi.fn>;
  };
};
const prismaMock = prisma as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("oauth state token", () => {
  it("round-trips an origin through a signed state", () => {
    const state = createOAuthStateToken("trace-mobile");
    expect(verifyOAuthStateToken(state)).toEqual({ origin: "trace-mobile" });
  });

  it("rejects a tampered state", () => {
    const state = createOAuthStateToken("trace-mobile");
    const tampered = state.slice(0, -2) + (state.endsWith("A") ? "BB" : "AA");
    expect(verifyOAuthStateToken(tampered)).toBeNull();
  });

  it("rejects tokens signed with the wrong token type", () => {
    const foreign = jwt.sign({ origin: "trace-mobile", tokenType: "session" }, JWT_SECRET);
    expect(verifyOAuthStateToken(foreign)).toBeNull();
  });

  it("rejects unsigned / garbage input", () => {
    expect(verifyOAuthStateToken("not-a-jwt")).toBeNull();
  });
});

describe("loopback address checks", () => {
  it("allows loopback IPs and rejects external addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("203.0.113.10")).toBe(false);
  });
});

describe("local login", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    const app = express();
    app.use(express.json());
    app.use(authRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    prismaMock.organization.findFirst.mockResolvedValue({
      id: "org-1",
      name: "Trace",
    });
    prismaMock.organization.findUnique.mockResolvedValue({
      id: "org-1",
      name: "Trace",
    });
    prismaMock.user.upsert.mockResolvedValue({
      id: TRACE_AI_USER_ID,
      email: "ai@trace.dev",
      name: "Trace AI",
      avatarUrl: null,
    });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "jane-developer-aaaaaaaaaaaaaaaaaaaaaaaa@trace.local",
      name: "Jane Developer",
      avatarUrl: null,
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      email: "jane-developer-aaaaaaaaaaaaaaaaaaaaaaaa@trace.local",
      name: "Jane Developer",
      avatarUrl: null,
    });
    prismaMock.channel.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.orgMember.upsert.mockResolvedValue({});
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    vi.unstubAllEnvs();
  });

  it("creates a local session token and bootstrap records without creating a default channel", async () => {
    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Developer" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { organizationId: string; user: { id: string } };
    expect(body.organizationId).toBe("org-1");
    expect(body.user.id).toBe("user-1");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("trace_token=");
    const cookieToken = /trace_token=([^;]+)/.exec(setCookie)?.[1];
    expect(cookieToken).toBeTruthy();
    expect(jwt.verify(cookieToken!, JWT_SECRET)).toMatchObject({ userId: "user-1" });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: expect.stringMatching(/^jane-developer-[a-f0-9]{24}@trace\.local$/),
        name: "Jane Developer",
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
    });
    expect(prismaMock.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        email: expect.stringMatching(/^jane-developer-[a-f0-9]{24}@trace\.local$/),
      },
      select: { id: true },
    });
    expect(prismaMock.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: "jane-developer@trace.local" },
      select: { id: true },
    });
    expect(prismaMock.orgMember.upsert).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-1",
          organizationId: "org-1",
        },
      },
      update: { role: "admin" },
      create: {
        userId: "user-1",
        organizationId: "org-1",
        role: "admin",
      },
    });
    expect(prismaMock.channel.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        name: "General",
        type: "coding",
        groupId: null,
        repoId: null,
        members: { none: {} },
        messages: { none: {} },
        projects: { none: {} },
        sessionGroups: { none: {} },
        sessions: { none: {} },
        tickets: { none: {} },
      },
    });
    expect(prismaMock.channel.create).not.toHaveBeenCalled();
  });

  it("cleans up the legacy bootstrap channel shape for existing local workspaces", async () => {
    prismaMock.channel.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Developer" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.channel.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        name: "General",
        type: "coding",
        groupId: null,
        repoId: null,
        members: { none: {} },
        messages: { none: {} },
        projects: { none: {} },
        sessionGroups: { none: {} },
        sessions: { none: {} },
        tickets: { none: {} },
      },
    });
  });

  it("rejects short names", async () => {
    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A" }),
    });

    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("resumes the most recently used local user when no name is provided", async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({ name: "Jane Developer" });

    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { organizationId: string; user: { id: string } };
    expect(body.user.id).toBe("user-1");
    expect(body.organizationId).toBe("org-1");
    const setCookie = res.headers.get("set-cookie") ?? "";
    const cookieToken = /trace_token=([^;]+)/.exec(setCookie)?.[1];
    expect(cookieToken).toBeTruthy();
    expect(jwt.verify(cookieToken!, JWT_SECRET)).toMatchObject({ userId: "user-1" });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          endsWith: "@trace.local",
        },
      },
      orderBy: { updatedAt: "desc" },
      select: { name: true },
    });
  });

  it("rejects tunneled local logins from external clients", async () => {
    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.10",
      },
      body: JSON.stringify({ name: "Jane Developer" }),
    });

    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects proxied local logins without forwarded-for when the forwarded host is public", async () => {
    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Host": "trace.example.com",
      },
      body: JSON.stringify({ name: "Jane Developer" }),
    });

    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("reuses legacy local users instead of creating a duplicate account", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "user-1" });

    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Developer" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        email: expect.stringMatching(/^jane-developer-[a-f0-9]{24}@trace\.local$/),
        name: "Jane Developer",
        githubId: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
    });
  });
});

describe("local-mode external auth", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    const app = express();
    app.use(express.json());
    app.use(authRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    vi.unstubAllEnvs();
  });

  it("rejects external auth/me requests that use a local session token", async () => {
    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Forwarded-For": "203.0.113.10",
      },
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "External local-mode access requires a paired mobile token",
    });
  });

  it("rejects external auth/me requests when the public origin is tunneled over localhost", async () => {
    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "https://trace.example.com",
      },
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "External local-mode access requires a paired mobile token",
    });
  });

  it("rejects external auth/me requests when the proxy only sends a Forwarded header", async () => {
    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Forwarded: 'for=203.0.113.10;host="trace.example.com"',
      },
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "External local-mode access requires a paired mobile token",
    });
  });

  it("allows external auth/me requests with a paired mobile token", async () => {
    prismaMock.localMobileDevice.findUnique.mockResolvedValueOnce({
      id: "device-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      revokedAt: null,
    });
    prismaMock.localMobileDevice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "local@trace.dev",
      name: "Local User",
      avatarUrl: null,
      orgMemberships: [],
    });

    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: "Bearer opaque-device-secret",
        "X-Forwarded-For": "203.0.113.10",
      },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "local@trace.dev",
        name: "Local User",
        avatarUrl: null,
        orgMemberships: [],
      },
    });
  });

  it("returns only the canonical organization in local mode auth/me", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-1" });
    prismaMock.localMobileDevice.findUnique.mockResolvedValueOnce({
      id: "device-1",
      ownerUserId: "user-1",
      organizationId: "org-2",
      revokedAt: null,
    });
    prismaMock.localMobileDevice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "local@trace.dev",
      name: "Local User",
      avatarUrl: null,
      orgMemberships: [
        {
          organizationId: "org-1",
          role: "admin",
          joinedAt: new Date("2024-01-01T00:00:00.000Z"),
          organization: { id: "org-1", name: "Trace" },
        },
        {
          organizationId: "org-2",
          role: "member",
          joinedAt: new Date("2024-01-02T00:00:00.000Z"),
          organization: { id: "org-2", name: "Other" },
        },
      ],
    });

    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: "Bearer opaque-device-secret",
        "X-Forwarded-For": "203.0.113.10",
      },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "local@trace.dev",
        name: "Local User",
        avatarUrl: null,
        orgMemberships: [
          {
            organizationId: "org-1",
            role: "admin",
            joinedAt: "2024-01-01T00:00:00.000Z",
            organization: { id: "org-1", name: "Trace" },
          },
        ],
      },
    });
  });

  it("does not echo the session token from auth/me by default", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "local@trace.dev",
      name: "Local User",
      avatarUrl: null,
      orgMemberships: [],
    });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "local@trace.dev",
        name: "Local User",
        avatarUrl: null,
        orgMemberships: [],
      },
    });
  });
});

describe("bridge auth tokens", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(authRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    vi.unstubAllEnvs();
  });

  it("mints bridge auth from the session cookie without echoing the session token", async () => {
    prismaMock.orgMember.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({ userId: "user-1" });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/bridge-token?instanceId=bridge-1`, {
      headers: {
        Cookie: `trace_token=${token}`,
        "X-Organization-Id": "org-1",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: string };
    expect(jwt.verify(body.token, JWT_SECRET)).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      instanceId: "bridge-1",
      tokenType: "bridge_auth",
    });
    expect(Date.parse(body.expiresAt)).not.toBeNaN();
  });

  it("reads auth/me from the browser session cookie without echoing the token", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "local@trace.dev",
      name: "Local User",
      avatarUrl: null,
      orgMemberships: [],
    });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Cookie: `trace_token=${token}`,
      },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "local@trace.dev",
        name: "Local User",
        avatarUrl: null,
        orgMemberships: [],
      },
    });
  });
});

describe("local mobile pairing", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    prismaMock.$transaction.mockImplementation(async (callback: (tx: PrismaMock) => unknown) =>
      callback(prismaMock),
    );

    const app = express();
    app.use(express.json());
    app.use(authRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    vi.unstubAllEnvs();
  });

  it("creates a one-time pairing token for an authenticated local session", async () => {
    prismaMock.orgMember.findUnique.mockResolvedValue({ organizationId: "org-1" });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/local-mobile/pairing-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": "org-1",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pairingToken: string; expiresAt: string };
    expect(body.pairingToken.length).toBeGreaterThan(20);
    expect(new Date(body.expiresAt).toString()).not.toBe("Invalid Date");
    expect(prismaMock.localMobilePairingToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: "user-1",
        organizationId: "org-1",
        tokenHash: expect.any(String),
      }),
    });
  });

  it("redeems a pairing token into a revocable device secret", async () => {
    prismaMock.localMobilePairingToken.findUnique
      .mockResolvedValueOnce({
        id: "pair-1",
        ownerUserId: "user-1",
        organizationId: "org-1",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      })
      .mockResolvedValueOnce({
        id: "pair-1",
        ownerUserId: "user-1",
        organizationId: "org-1",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });
    prismaMock.localMobileDevice.upsert.mockResolvedValue({ id: "device-1" });
    prismaMock.localMobilePairingToken.update.mockResolvedValue({ id: "pair-1" });

    const res = await fetch(`${baseUrl}/auth/local-mobile/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingToken: "pair-token-1234567890",
        installId: "install-12345678",
        deviceName: "Vineet's iPhone",
        platform: "ios",
        appVersion: "0.0.1",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      deviceId: string;
      organizationId: string;
    };
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.deviceId).toBe("device-1");
    expect(body.organizationId).toBe("org-1");
    expect(prismaMock.localMobileDevice.upsert).toHaveBeenCalledWith({
      where: {
        ownerUserId_organizationId_installId: {
          ownerUserId: "user-1",
          organizationId: "org-1",
          installId: "install-12345678",
        },
      },
      update: expect.objectContaining({
        deviceName: "Vineet's iPhone",
        platform: "ios",
        appVersion: "0.0.1",
        revokedAt: null,
      }),
      create: expect.objectContaining({
        ownerUserId: "user-1",
        organizationId: "org-1",
        installId: "install-12345678",
      }),
      select: {
        id: true,
      },
    });
  });

  it("revokes local mobile device secrets on logout", async () => {
    prismaMock.localMobileDevice.findUnique.mockResolvedValue({
      id: "device-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      revokedAt: null,
    });
    prismaMock.localMobileDevice.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.pushToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: "Bearer opaque-device-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pushToken: "ExponentPushToken[current-device]" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.localMobileDevice.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", token: "ExponentPushToken[current-device]" },
    });
  });

  it("does not remove every push token when logout omits a current push token", async () => {
    prismaMock.localMobileDevice.findUnique.mockResolvedValue({
      id: "device-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      revokedAt: null,
    });
    prismaMock.localMobileDevice.updateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Authorization: "Bearer opaque-device-secret" },
    });

    expect(res.status).toBe(200);
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe("github oauth callback", () => {
  let server: Server;
  let baseUrl: string;
  const realFetch = globalThis.fetch;
  const githubUser = {
    id: 42,
    login: "octocat",
    email: "octo@example.com" as string | null,
    avatar_url: "https://example.com/a.png",
    name: "Octo Cat",
  };

  function stubGitHubFetch({
    user = githubUser,
    emails,
  }: {
    user?: typeof githubUser;
    emails?: unknown;
  } = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "gh-access" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/user")) {
          return new Response(JSON.stringify(user), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/user/emails")) {
          return new Response(JSON.stringify(emails), {
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  }

  beforeEach(async () => {
    const app = express();
    app.use(authRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    stubGitHubFetch();

    prismaMock.user.findFirst.mockResolvedValue({ id: "user-1" });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      email: "octo@example.com",
      name: "Octo Cat",
      githubId: 42,
      avatarUrl: "https://example.com/a.png",
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("redirects to the mobile scheme when state encodes trace-mobile", async () => {
    const state = createOAuthStateToken("trace-mobile");
    const res = await fetch(
      `${baseUrl}/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("trace://auth/callback?token=")).toBe(true);

    const token = new URL(location).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(jwt.verify(token!, JWT_SECRET)).toMatchObject({ userId: "user-1" });
  });

  it("uses the verified primary GitHub email when the public profile email is hidden", async () => {
    stubGitHubFetch({
      user: { ...githubUser, email: null },
      emails: [
        { email: "secondary@example.com", primary: false, verified: true },
        { email: "private@example.com", primary: true, verified: true },
      ],
    });
    const state = createOAuthStateToken("trace-mobile");
    const res = await fetch(
      `${baseUrl}/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ githubId: 42 }, { email: "private@example.com" }] },
    });
  });

  it("returns a bad request instead of throwing when GitHub emails is not an array", async () => {
    stubGitHubFetch({
      user: { ...githubUser, email: null },
      emails: { message: "Requires authentication" },
    });
    const state = createOAuthStateToken("trace-mobile");
    const res = await fetch(
      `${baseUrl}/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Could not retrieve email from GitHub" });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to popup HTML for web origins", async () => {
    const state = createOAuthStateToken("http://localhost:3000");
    const res = await fetch(
      `${baseUrl}/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(res.headers.get("set-cookie") ?? "").toContain("trace_token=");
    expect(body).toContain("window.opener.postMessage");
    expect(body).toContain('BroadcastChannel("trace_auth")');
    expect(body).toContain("http://localhost:3000");
    expect(body).not.toContain("trace://auth/callback");
    expect(body).not.toContain("localStorage.setItem");
    expect(body).not.toContain("token:");
  });

  it("ignores an invalid state and defaults to web origin", async () => {
    const res = await fetch(`${baseUrl}/auth/github/callback?code=abc&state=bogus`, {
      redirect: "manual",
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("window.opener.postMessage");
    expect(body).not.toContain("trace://auth/callback");
  });

  it("falls back to WEB_URL when the signed state carries a non-allowlisted origin", async () => {
    const state = createOAuthStateToken("http://evil.example.com");
    const res = await fetch(
      `${baseUrl}/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("window.opener.postMessage");
    expect(body).not.toContain("evil.example.com");
  });

  it("clears the browser session cookie on logout", async () => {
    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `trace_token=${token}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("trace_token=;");
  });
});

describe("oauth origin allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("always permits the mobile sentinel and the configured web url", () => {
    const origins = getAllowedOAuthOrigins();
    expect(origins.has("trace-mobile")).toBe(true);
    expect(origins.size).toBeGreaterThanOrEqual(2);
  });

  it("includes CORS_ALLOWED_ORIGINS when set", () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://example.com, https://staging.example.com");
    const origins = getAllowedOAuthOrigins();
    expect(origins.has("https://example.com")).toBe(true);
    expect(origins.has("https://staging.example.com")).toBe(true);
  });
});
