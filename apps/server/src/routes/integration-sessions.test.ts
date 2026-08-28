import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/integration-credential.js", () => ({
  integrationCredentialService: { authenticate: vi.fn() },
}));

vi.mock("../services/integration-session.js", () => ({
  integrationSessionService: { create: vi.fn(), get: vi.fn() },
}));

import { integrationCredentialService } from "../services/integration-credential.js";
import { integrationSessionService } from "../services/integration-session.js";
import { integrationSessionsRouter } from "./integration-sessions.js";

const authenticateMock = integrationCredentialService.authenticate as ReturnType<typeof vi.fn>;
const createMock = integrationSessionService.create as ReturnType<typeof vi.fn>;
const getMock = integrationSessionService.get as ReturnType<typeof vi.fn>;
const credential = {
  id: "credential-1",
  organizationId: "org-1",
  createdById: "user-1",
  scopes: ["sessions_create", "sessions_read"],
  allowedChannelIds: ["channel-1"],
};

describe("integration session routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const app = express();
    app.use(express.json());
    app.use(integrationSessionsRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  it("rejects requests without a valid integration credential", async () => {
    authenticateMock.mockResolvedValue(null);
    const response = await fetch(`${baseUrl}/api/v1/sessions/session-1`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid integration credential" });
  });

  it("creates a session using the create scope", async () => {
    authenticateMock.mockResolvedValue(credential);
    createMock.mockResolvedValue({ id: "session-1", sessionStatus: "in_progress" });

    const response = await fetch(`${baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer trc_int_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: "Fix checkout",
        channelId: "channel-1",
        idempotencyKey: "incident-42",
      }),
    });

    expect(response.status).toBe(201);
    expect(authenticateMock).toHaveBeenCalledWith("trc_int_secret", "sessions_create");
    await expect(response.json()).resolves.toEqual({
      session: { id: "session-1", sessionStatus: "in_progress" },
    });
  });

  it("does not reveal sessions outside the credential", async () => {
    authenticateMock.mockResolvedValue(credential);
    getMock.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/v1/sessions/other-session`, {
      headers: { Authorization: "Bearer trc_int_secret" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Session not found" });
  });
});
