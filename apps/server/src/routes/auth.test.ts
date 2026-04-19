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
