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

vi.mock("../lib/redis.js", async () => {
  const { createRedisMock } = await import("../../test/helpers.js");
  return { redis: createRedisMock() };
});

vi.mock("../services/org-member.js", () => ({
  orgMemberService: { addMember: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { isLoopbackAddress } from "../lib/auth.js";
import { orgMemberService } from "../services/org-member.js";
import { authRouter } from "./auth.js";

const orgMemberMock = orgMemberService as unknown as { addMember: ReturnType<typeof vi.fn> };

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
const redisMock = redis as ReturnType<typeof import("../../test/helpers.js").createRedisMock>;
const redisStore = new Map<string, string>();

beforeEach(() => {
  vi.resetAllMocks();
  redisStore.clear();
  redisMock.set.mockImplementation(async (key: string, value: string) => {
    redisStore.set(key, value);
    return "OK";
  });
  redisMock.get.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
  redisMock.incr.mockImplementation(async (key: string) => {
    const next = Number(redisStore.get(key) ?? "0") + 1;
    redisStore.set(key, String(next));
    return next;
  });
  redisMock.expire.mockResolvedValue(1);
  redisMock.ttl.mockResolvedValue(60);
  redisMock.del.mockImplementation(async (...keys: string[]) => {
    let count = 0;
    for (const key of keys) {
      if (redisStore.delete(key)) count += 1;
    }
    return count;
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

  it("marks bridge auth responses as local mode in local workspaces", async () => {
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
    const body = (await res.json()) as { token: string; expiresAt: string; localMode: boolean };
    expect(body.localMode).toBe(true);
    expect(jwt.verify(body.token, JWT_SECRET)).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      instanceId: "bridge-1",
      tokenType: "bridge_auth",
    });
    expect(Date.parse(body.expiresAt)).not.toBeNaN();
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
    prismaMock.mobileDevice.findUnique.mockResolvedValueOnce({
      id: "device-1",
      ownerUserId: "user-1",
      pairedOrganizationId: "org-1",
      revokedAt: null,
    });
    prismaMock.mobileDevice.updateMany.mockResolvedValueOnce({ count: 1 });
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
    prismaMock.mobileDevice.findUnique.mockResolvedValueOnce({
      id: "device-1",
      ownerUserId: "user-1",
      pairedOrganizationId: "org-2",
      revokedAt: null,
    });
    prismaMock.mobileDevice.updateMany.mockResolvedValueOnce({ count: 1 });
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
    const body = (await res.json()) as { token: string; expiresAt: string; localMode: boolean };
    expect(jwt.verify(body.token, JWT_SECRET)).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      instanceId: "bridge-1",
      tokenType: "bridge_auth",
    });
    expect(Date.parse(body.expiresAt)).not.toBeNaN();
    expect(body.localMode).toBe(false);
  });

  it("mints bridge auth from a mobile token for any requested member organization", async () => {
    prismaMock.mobileDevice.findUnique.mockResolvedValueOnce({
      id: "device-1",
      ownerUserId: "user-1",
      pairedOrganizationId: "org-paired-from",
      revokedAt: null,
    });
    prismaMock.mobileDevice.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.orgMember.findUnique
      .mockResolvedValueOnce({ organizationId: "org-2" })
      .mockResolvedValueOnce({ userId: "user-1" });

    const res = await fetch(`${baseUrl}/auth/bridge-token?instanceId=bridge-1`, {
      headers: {
        Authorization: "Bearer opaque-device-secret",
        "X-Organization-Id": "org-2",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: string; localMode: boolean };
    expect(jwt.verify(body.token, JWT_SECRET)).toMatchObject({
      userId: "user-1",
      organizationId: "org-2",
      instanceId: "bridge-1",
      tokenType: "bridge_auth",
    });
    expect(body.localMode).toBe(false);
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

  it("does not return 304 for auth/me conditional requests", async () => {
    const user = {
      id: "user-1",
      email: "local@trace.dev",
      name: "Local User",
      avatarUrl: null,
      defaultSessionTool: null,
      defaultSessionModel: null,
      defaultSessionReasoningEffort: null,
      autoArchiveMergedSessions: null,
      orgMemberships: [],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const first = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Cookie: `trace_token=${token}`,
      },
    });
    const etag = first.headers.get("etag");

    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(etag).toBeTruthy();

    const second = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Cookie: `trace_token=${token}`,
        "If-None-Match": etag ?? "",
      },
    });

    expect(second.status).toBe(200);
    expect(second.headers.get("cache-control")).toContain("no-store");
    await expect(second.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "local@trace.dev",
        name: "Local User",
        avatarUrl: null,
        defaultSessionTool: null,
        defaultSessionModel: null,
        defaultSessionReasoningEffort: null,
        autoArchiveMergedSessions: null,
        orgMemberships: [],
      },
    });
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

describe("mobile pairing in local mode", () => {
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

  it("creates a one-time pairing token for an authenticated local-mode session", async () => {
    prismaMock.organization.findFirst.mockResolvedValue({ id: "org-1" });
    prismaMock.orgMember.findUnique.mockResolvedValue({ organizationId: "org-1" });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/mobile/pairing-token`, {
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
    expect(prismaMock.mobilePairingToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: "user-1",
        organizationId: "org-1",
        tokenHash: expect.any(String),
      }),
    });
  });

  it("redeems a pairing token into a revocable device secret", async () => {
    prismaMock.mobilePairingToken.findUnique.mockResolvedValueOnce({
      id: "pair-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    prismaMock.mobileDevice.upsert.mockResolvedValue({ id: "device-1" });
    prismaMock.mobilePairingToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/auth/mobile/pair`, {
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
    expect(prismaMock.mobilePairingToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "pair-1",
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(prismaMock.mobileDevice.upsert).toHaveBeenCalledWith({
      where: {
        ownerUserId_installId: {
          ownerUserId: "user-1",
          installId: "install-12345678",
        },
      },
      update: expect.objectContaining({
        pairedOrganizationId: "org-1",
        deviceName: "Vineet's iPhone",
        platform: "ios",
        appVersion: "0.0.1",
        revokedAt: null,
      }),
      create: expect.objectContaining({
        ownerUserId: "user-1",
        pairedOrganizationId: "org-1",
        installId: "install-12345678",
      }),
      select: {
        id: true,
      },
    });
  });

  it("rejects a pairing token when another request already claimed it", async () => {
    prismaMock.mobilePairingToken.findUnique.mockResolvedValueOnce({
      id: "pair-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    prismaMock.mobilePairingToken.updateMany.mockResolvedValue({ count: 0 });

    const res = await fetch(`${baseUrl}/auth/mobile/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingToken: "pair-token-1234567890",
        installId: "install-12345678",
      }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Pairing code is invalid or expired" });
    expect(prismaMock.mobileDevice.upsert).not.toHaveBeenCalled();
  });

  it("revokes mobile device secrets on logout", async () => {
    prismaMock.mobileDevice.findUnique.mockResolvedValue({
      id: "device-1",
      ownerUserId: "user-1",
      pairedOrganizationId: "org-1",
      revokedAt: null,
    });
    prismaMock.mobileDevice.updateMany.mockResolvedValue({ count: 1 });
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
    expect(prismaMock.mobileDevice.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", token: "ExponentPushToken[current-device]" },
    });
  });

  it("does not remove every push token when logout omits a current push token", async () => {
    prismaMock.mobileDevice.findUnique.mockResolvedValue({
      id: "device-1",
      ownerUserId: "user-1",
      pairedOrganizationId: "org-1",
      revokedAt: null,
    });
    prismaMock.mobileDevice.updateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Authorization: "Bearer opaque-device-secret" },
    });

    expect(res.status).toBe(200);
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe("mobile pairing in hosted mode", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
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
  });

  it("creates a one-time pairing token for an authenticated hosted session", async () => {
    prismaMock.orgMember.findUnique.mockResolvedValue({ organizationId: "org-1" });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/mobile/pairing-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": "org-1",
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pairingToken: string; expiresAt: string };
    expect(body.pairingToken.length).toBeGreaterThan(20);
    expect(prismaMock.mobilePairingToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: "user-1",
        organizationId: "org-1",
        tokenHash: expect.any(String),
      }),
    });
  });

  it("redeems a hosted pairing token into a mobile device secret", async () => {
    prismaMock.mobilePairingToken.findUnique.mockResolvedValueOnce({
      id: "pair-1",
      ownerUserId: "user-1",
      organizationId: "org-1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    prismaMock.mobileDevice.upsert.mockResolvedValue({ id: "device-1" });
    prismaMock.mobilePairingToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/auth/mobile/pair`, {
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
  });

  it("lists mobile devices across all organizations for the signed-in user", async () => {
    prismaMock.mobileDevice.findMany.mockResolvedValue([
      {
        id: "device-1",
        installId: "install-1",
        deviceName: "iPhone",
        platform: "ios",
        appVersion: "0.0.1",
        lastSeenAt: new Date("2026-05-01T00:00:00.000Z"),
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/mobile/devices`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": "org-2",
      },
    });

    expect(res.status).toBe(200);
    expect(prismaMock.mobileDevice.findMany).toHaveBeenCalledWith({
      where: {
        ownerUserId: "user-1",
        revokedAt: null,
      },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        installId: true,
        deviceName: true,
        platform: true,
        appVersion: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  });

  it("revokes a mobile device by owner without requiring the paired organization", async () => {
    prismaMock.mobileDevice.updateMany.mockResolvedValue({ count: 1 });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/auth/mobile/devices/device-1`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": "org-2",
      },
    });

    expect(res.status).toBe(200);
    expect(prismaMock.mobileDevice.updateMany).toHaveBeenCalledWith({
      where: {
        id: "device-1",
        ownerUserId: "user-1",
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("github device oauth", () => {
  let server: Server;
  let baseUrl: string;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(authRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
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
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not expose the legacy redirect OAuth endpoints", async () => {
    const startRes = await fetch(`${baseUrl}/auth/github`, { redirect: "manual" });
    const callbackRes = await fetch(`${baseUrl}/auth/github/callback?code=abc`, {
      redirect: "manual",
    });

    expect(startRes.status).toBe(404);
    expect(callbackRes.status).toBe(404);
  });

  it("starts device login without exposing the GitHub device code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        expect(new URLSearchParams(init?.body?.toString()).get("scope")).toBe("read:org");
        return new Response(
          JSON.stringify({
            device_code: "secret-device-code",
            user_code: "WDJB-MJHT",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const res = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.deviceAuthId).toEqual(expect.any(String));
    expect(body.userCode).toBe("WDJB-MJHT");
    expect(body.verificationUri).toBe("https://github.com/login/device");
    expect(body).not.toHaveProperty("deviceCode");
  });

  it("starts and polls device login when Redis device storage is out of memory", async () => {
    redisMock.set.mockRejectedValueOnce(
      new Error("OOM command not allowed when used memory > 'maxmemory'."),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          expect(init?.body?.toString()).toContain("device_code=secret-device-code");
          return new Response(JSON.stringify({ error: "authorization_pending" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    expect(startRes.status).toBe(200);
    const startBody = (await startRes.json()) as { deviceAuthId: string };

    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(200);
    await expect(pollRes.json()).resolves.toEqual({ status: "pending", interval: 5 });
  });

  it("polls GitHub and creates a Trace session cookie after approval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          expect(init?.body?.toString()).toContain("device_code=secret-device-code");
          expect(init?.body?.toString()).toContain(
            "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
          );
          return new Response(JSON.stringify({ access_token: "gh-access", scope: "" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/user")) {
          return new Response(
            JSON.stringify({
              id: 42,
              login: "octocat",
              email: null,
              avatar_url: "https://example.com/a.png",
              name: "Octo Cat",
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/user/memberships/orgs/")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    const startBody = (await startRes.json()) as { deviceAuthId: string };

    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(200);
    expect(await pollRes.json()).toEqual({ status: "success" });
    expect(orgMemberMock.addMember).not.toHaveBeenCalled();
    const setCookie = pollRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("trace_token=");
    const cookieToken = /trace_token=([^;]+)/.exec(setCookie)?.[1];
    expect(cookieToken).toBeTruthy();
    expect(jwt.verify(cookieToken!, JWT_SECRET)).toMatchObject({ userId: "user-1" });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { githubId: 42 } });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("does not link GitHub login by public profile email", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({
      id: "user-2",
      email: "github-42@trace.local",
      name: "Octo Cat",
      githubId: 42,
      avatarUrl: "https://example.com/a.png",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "gh-access", scope: "" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/user")) {
          return new Response(
            JSON.stringify({
              id: 42,
              login: "octocat",
              email: "victim@example.com",
              avatar_url: "https://example.com/a.png",
              name: "Octo Cat",
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/user/memberships/orgs/")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    const startBody = (await startRes.json()) as { deviceAuthId: string };
    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(200);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { githubId: 42 } });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "github-42@trace.local",
        name: "Octo Cat",
        githubId: 42,
        avatarUrl: "https://example.com/a.png",
      },
    });
  });

  it("auto-joins the organization when the user is an active GitHub org member", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-1" });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce(null);
    let membershipOrg: string | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "gh-access", scope: "read:org" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/user")) {
          return new Response(
            JSON.stringify({
              id: 42,
              login: "octocat",
              email: null,
              avatar_url: "https://example.com/a.png",
              name: "Octo Cat",
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        const membershipMatch = /\/user\/memberships\/orgs\/([^/]+)$/.exec(url);
        if (membershipMatch) {
          membershipOrg = decodeURIComponent(membershipMatch[1]);
          return new Response(JSON.stringify({ state: "active" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    const startBody = (await startRes.json()) as { deviceAuthId: string };
    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(200);
    expect(membershipOrg).toBe("opendoor-labs");
    expect(orgMemberMock.addMember).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      actorType: "system",
      actorId: "system",
    });
  });

  it("does not auto-join when already an organization member", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-1" });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({ userId: "user-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "gh-access", scope: "read:org" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/user")) {
          return new Response(
            JSON.stringify({
              id: 42,
              login: "octocat",
              email: null,
              avatar_url: "https://example.com/a.png",
              name: "Octo Cat",
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/user/memberships/orgs/")) {
          return new Response(JSON.stringify({ state: "active" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    const startBody = (await startRes.json()) as { deviceAuthId: string };
    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(200);
    expect(orgMemberMock.addMember).not.toHaveBeenCalled();
  });

  it("fails closed when GitHub user identity cannot be verified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          return new Response(JSON.stringify({ access_token: "gh-access", scope: "" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/user")) {
          return new Response(JSON.stringify({ message: "Bad credentials" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    const startBody = (await startRes.json()) as { deviceAuthId: string };

    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(400);
    expect(await pollRes.json()).toEqual({
      status: "error",
      error: "Could not verify GitHub identity. Start GitHub login again.",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("rejects access tokens with GitHub scopes", async () => {
    vi.stubEnv("GITHUB_CLIENT_SECRET", "github-secret");
    let revokedGrant = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          expect(init?.body?.toString()).toContain("device_code=secret-device-code");
          return new Response(JSON.stringify({ access_token: "gh-access", scope: "user:email" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/applications/") && url.endsWith("/grant")) {
          expect(init?.method).toBe("DELETE");
          expect(init?.headers).toMatchObject({
            Authorization: expect.stringMatching(/^Basic /),
          });
          expect(init?.body).toBe(JSON.stringify({ access_token: "gh-access" }));
          revokedGrant = true;
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    const startBody = (await startRes.json()) as { deviceAuthId: string };

    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(400);
    expect(await pollRes.json()).toEqual({
      status: "error",
      error: "Removed old GitHub permissions for Trace. Start GitHub login again.",
    });
    expect(revokedGrant).toBe(true);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("keeps polling when GitHub authorization is pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        if (url.includes("/login/device/code")) {
          return new Response(
            JSON.stringify({
              device_code: "secret-device-code",
              user_code: "WDJB-MJHT",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/login/oauth/access_token")) {
          return new Response(JSON.stringify({ error: "authorization_pending" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const startRes = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    const startBody = (await startRes.json()) as { deviceAuthId: string };
    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: startBody.deviceAuthId }),
    });

    expect(pollRes.status).toBe(200);
    expect(await pollRes.json()).toEqual({ status: "pending", interval: 5 });
  });

  it("rate limits repeated GitHub device login starts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("http://127.0.0.1")) {
          return realFetch(input, init);
        }
        return new Response(
          JSON.stringify({
            device_code: "secret-device-code",
            user_code: "WDJB-MJHT",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    let res: Response | null = null;
    for (let i = 0; i < 11; i += 1) {
      res = await fetch(`${baseUrl}/auth/github/device/start`, { method: "POST" });
    }

    if (!res) throw new Error("Expected a response");
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "Too many requests" });
  });
});
