import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import express from "express";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    getPutUrl: vi.fn(),
    getGetUrl: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { uploadRouter } from "./upload.js";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const storageMock = storage as unknown as {
  getPutUrl: ReturnType<typeof vi.fn>;
  getGetUrl: ReturnType<typeof vi.fn>;
};

describe("upload routes in local mode", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    const app = express();
    app.use(express.json());
    app.use(uploadRouter);

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

  it("collapses presigned uploads to the canonical local organization", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-local" });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({ role: "admin" });
    storageMock.getPutUrl.mockResolvedValueOnce("https://upload.example/put");

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/uploads/presign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: "screen.png",
        contentType: "image/png",
        organizationId: "org-stale",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; key: string };
    expect(body.uploadUrl).toBe("https://upload.example/put");
    expect(body.key.startsWith("uploads/org-local/")).toBe(true);
    expect(prismaMock.orgMember.findUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-1",
          organizationId: "org-local",
        },
      },
      select: { role: true },
    });
  });

  it("presigns non-image file uploads", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-local" });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({ role: "admin" });
    storageMock.getPutUrl.mockResolvedValueOnce("https://upload.example/put");

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/uploads/presign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: "notes.pdf",
        contentType: "application/pdf",
        organizationId: "org-local",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; key: string };
    expect(body.uploadUrl).toBe("https://upload.example/put");
    expect(body.key).toMatch(/^uploads\/org-local\/.+-notes\.pdf$/);
    expect(storageMock.getPutUrl).toHaveBeenCalledWith(body.key, "application/pdf");
  });

  it("rejects local-mode upload URLs for non-canonical organizations", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-local" });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(
      `${baseUrl}/uploads/url?key=${encodeURIComponent("uploads/org-stale/file.png")}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Local mode only supports one organization",
    });
    expect(storageMock.getGetUrl).not.toHaveBeenCalled();
  });

  it("rejects proxied external uploads without a paired mobile token", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user-1" });

    const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
    const res = await fetch(`${baseUrl}/uploads/presign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Forwarded-Host": "trace.example.com",
      },
      body: JSON.stringify({
        filename: "screen.png",
        contentType: "image/png",
        organizationId: "org-local",
      }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "External local-mode access requires a paired mobile token",
    });
    expect(storageMock.getPutUrl).not.toHaveBeenCalled();
  });
});
