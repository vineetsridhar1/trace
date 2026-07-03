import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import express from "express";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { createMcpRouter } from "./mcp.js";
import { traceOAuthProvider } from "../lib/oauth/provider.js";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const RESOURCE_METADATA_URL = "http://127.0.0.1/.well-known/oauth-protected-resource/mcp";
const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;

describe("MCP HTTP endpoint auth", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const app = express();
    app.use(express.json());
    app.use(
      createMcpRouter({
        loopbackBaseUrl: "http://127.0.0.1:1",
        verifier: traceOAuthProvider,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      }),
    );

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

  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  };

  it("rejects a request with no bearer token", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(initialize),
    });
    expect(res.status).toBe(401);
    // The bearer-auth middleware advertises the OAuth resource metadata so
    // clients can discover the authorization server and self-authorize.
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata");
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_token");
  });

  it("rejects an invalid bearer token", async () => {
    prismaMock.mobileDevice.findUnique.mockResolvedValueOnce(null);
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer not-a-real-token",
      },
      body: JSON.stringify(initialize),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_token");
  });

  it("returns 405 for GET and DELETE", async () => {
    const token = jwt.sign({ userId: "user-1", organizationId: "org-1" }, JWT_SECRET);
    for (const method of ["GET", "DELETE"] as const) {
      const res = await fetch(`${baseUrl}/mcp`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });
});
