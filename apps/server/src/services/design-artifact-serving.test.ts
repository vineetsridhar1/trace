import { beforeEach, describe, expect, it, vi } from "vitest";
import type express from "express";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import {
  artifactIdFromUserContentHost,
  buildDesignArtifactPublicUrl,
  buildDesignArtifactBootstrapHtml,
  handleDesignArtifactUserContent,
} from "./design-artifact-serving.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function makeResponse(): MockResponse {
  const response: MockResponse = {
    status: vi.fn(),
    set: vi.fn(),
    type: vi.fn(),
    send: vi.fn(),
    end: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.set.mockReturnValue(response);
  response.type.mockReturnValue(response);
  response.send.mockReturnValue(response);
  response.end.mockReturnValue(response);
  return response;
}

function makeRequest(input: { host: string; path?: string; method?: string }) {
  return {
    headers: { host: input.host },
    path: input.path ?? "/",
    method: input.method ?? "GET",
  } as express.Request;
}

describe("design artifact user-content serving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRACE_USER_CONTENT_DOMAIN", "traceusercontent.test");
  });

  it("extracts artifact ids from configured user-content hosts only", () => {
    expect(artifactIdFromUserContentHost("artifact-1.traceusercontent.test")).toBe("artifact-1");
    expect(artifactIdFromUserContentHost("artifact-1.traceusercontent.test:4000")).toBe(
      "artifact-1",
    );
    expect(artifactIdFromUserContentHost("artifact-1.example.test")).toBeNull();
    expect(artifactIdFromUserContentHost("nested.artifact.traceusercontent.test")).toBeNull();
  });

  it("builds public URLs only for published artifacts", () => {
    vi.stubEnv("TRACE_USER_CONTENT_PROTOCOL", "http");

    expect(buildDesignArtifactPublicUrl("artifact-1", null)).toBeNull();
    expect(buildDesignArtifactPublicUrl("artifact-1", new Date("2026-07-09T10:00:00.000Z"))).toBe(
      "http://artifact-1.traceusercontent.test/",
    );
  });

  it("passes through non user-content hosts", async () => {
    const response = makeResponse();
    const next = vi.fn();

    await handleDesignArtifactUserContent(
      makeRequest({ host: "api.example.test" }),
      response as unknown as express.Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(prismaMock.artifact.findFirst).not.toHaveBeenCalled();
  });

  it("serves bootstrap HTML without reading an artifact", async () => {
    const response = makeResponse();
    const next = vi.fn();

    await handleDesignArtifactUserContent(
      makeRequest({ host: "artifact-1.traceusercontent.test", path: "/_bootstrap" }),
      response as unknown as express.Response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        "Cache-Control": "no-store",
        "Content-Security-Policy": expect.stringContaining("default-src 'self'"),
        "Cross-Origin-Opener-Policy": "same-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      }),
    );
    expect(response.type).toHaveBeenCalledWith("html");
    expect(response.send).toHaveBeenCalledWith(buildDesignArtifactBootstrapHtml());
    expect(prismaMock.artifact.findFirst).not.toHaveBeenCalled();
  });

  it("serves a bootstrap shell with nonce-bound render and reply protocol", () => {
    const html = buildDesignArtifactBootstrapHtml();

    expect(html).toContain("parentOrigin");
    expect(html).toContain("nonce");
    expect(html).toContain("trace:artifact:ready");
    expect(html).toContain("trace:artifact:render");
    expect(html).toContain("trace:artifact:error");
    expect(html).toContain("trace:artifact:element-selected");
    expect(html).not.toContain("{{artifact");
  });

  it("404s unpublished or missing artifacts", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce(null);
    const response = makeResponse();

    await handleDesignArtifactUserContent(
      makeRequest({ host: "artifact-1.traceusercontent.test" }),
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(prismaMock.artifact.findFirst).toHaveBeenCalledWith({
      where: {
        id: "artifact-1",
        contentType: "text/html",
        publishedAt: { not: null },
      },
      select: { html: true },
    });
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.end).toHaveBeenCalledWith("Not found");
  });

  it("serves published artifact HTML with isolation headers", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce({
      html: "<!doctype html><html><body>Published</body></html>",
    });
    const response = makeResponse();

    await handleDesignArtifactUserContent(
      makeRequest({ host: "artifact-1.traceusercontent.test" }),
      response as unknown as express.Response,
      vi.fn(),
    );

    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
      }),
    );
    expect(response.type).toHaveBeenCalledWith("html");
    expect(response.send).toHaveBeenCalledWith(
      "<!doctype html><html><body>Published</body></html>",
    );
  });
});
