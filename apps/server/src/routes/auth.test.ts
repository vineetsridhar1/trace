import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import express from "express";
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
    },
  };
});

import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import {
  authRouter,
  createOAuthStateToken,
  getAllowedOAuthOrigins,
  isLoopbackHost,
  verifyOAuthStateToken,
} from "./auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
type PrismaMock = ReturnType<typeof import("../../test/helpers.js").createPrismaMock> & {
  user: ReturnType<typeof import("../../test/helpers.js").createPrismaMock>["user"] & {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};
const prismaMock = prisma as unknown as PrismaMock;

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

describe("loopback host checks", () => {
  it("allows localhost hosts and rejects tunneled hosts", () => {
    expect(isLoopbackHost("localhost:4000")).toBe(true);
    expect(isLoopbackHost("127.0.0.1:4000")).toBe(true);
    expect(isLoopbackHost("[::1]:4000")).toBe(true);
    expect(isLoopbackHost("trace.ngrok-free.app")).toBe(false);
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
    prismaMock.user.upsert
      .mockResolvedValueOnce({
        id: TRACE_AI_USER_ID,
        email: "ai@trace.dev",
        name: "Trace AI",
        avatarUrl: null,
      })
      .mockResolvedValueOnce({
        id: "user-1",
        email: "jane-developer@trace.local",
        name: "Jane Developer",
        avatarUrl: null,
      });
    prismaMock.orgMember.upsert.mockResolvedValue({});
    prismaMock.channel.findFirst.mockResolvedValue(null);
    prismaMock.channel.create.mockResolvedValue({ id: "channel-1" });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    vi.unstubAllEnvs();
  });

  it("creates a local session token and bootstrap records", async () => {
    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Developer" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; organizationId: string };
    expect(jwt.verify(body.token, JWT_SECRET)).toMatchObject({ userId: "user-1" });
    expect(body.organizationId).toBe("org-1");
    expect(prismaMock.user.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { email: "jane-developer@trace.local" },
      }),
    );
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
    expect(prismaMock.channel.create).toHaveBeenCalledWith({
      data: {
        name: "General",
        organizationId: "org-1",
        type: "coding",
      },
    });
  });

  it("rejects short names", async () => {
    const res = await fetch(`${baseUrl}/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: " " }),
    });

    expect(res.status).toBe(400);
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
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

    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Authorization: "Bearer opaque-device-secret" },
    });

    expect(res.status).toBe(200);
    expect(prismaMock.localMobileDevice.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe("github oauth callback", () => {
  let server: Server;
  let baseUrl: string;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    const app = express();
    app.use(authRouter);

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

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
          return new Response(
            JSON.stringify({
              id: 42,
              login: "octocat",
              email: "octo@example.com",
              avatar_url: "https://example.com/a.png",
              name: "Octo Cat",
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

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

  it("falls back to popup HTML for web origins", async () => {
    const state = createOAuthStateToken("http://localhost:3000");
    const res = await fetch(
      `${baseUrl}/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("window.opener.postMessage");
    expect(body).toContain("http://localhost:3000");
    expect(body).not.toContain("trace://auth/callback");
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
    vi.stubEnv(
      "CORS_ALLOWED_ORIGINS",
      "https://trace.app, https://staging.trace.app",
    );
    const origins = getAllowedOAuthOrigins();
    expect(origins.has("https://trace.app")).toBe(true);
    expect(origins.has("https://staging.trace.app")).toBe(true);
  });
});
