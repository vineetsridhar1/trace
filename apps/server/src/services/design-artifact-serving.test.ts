import { beforeEach, describe, expect, it, vi } from "vitest";
import type express from "express";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    getObject: vi
      .fn()
      .mockResolvedValue(Buffer.from("<!doctype html><html><body>Published</body></html>")),
  },
}));

import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import {
  artifactIdFromUserContentHost,
  buildDesignArtifactPublicUrl,
  buildDesignArtifactBootstrapHtml,
  handleDesignArtifactUserContent,
} from "./design-artifact-serving.js";
import { DESIGN_ARTIFACT_CONTENT_TYPE } from "./design-artifact-html.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const storageMock = storage as { getObject: ReturnType<typeof vi.fn> };

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

  it("falls back to https for invalid user-content public URL protocols", () => {
    vi.stubEnv("TRACE_USER_CONTENT_PROTOCOL", "javascript");

    expect(buildDesignArtifactPublicUrl("artifact-1", new Date("2026-07-09T10:00:00.000Z"))).toBe(
      "https://artifact-1.traceusercontent.test/",
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
    expect(html).toContain("var rect = el.getBoundingClientRect()");
    expect(html).toContain("dataEl: el.getAttribute(\"data-el\")");
    expect(html).toContain("bounds: {");
    expect(html).toContain("x: rect.left / viewportWidth");
    expect(html).toContain("y: rect.top / viewportHeight");
    expect(html).not.toContain("{{artifact");
  });

  it("serves a bootstrap shell that renders authoring comment pins", () => {
    const html = buildDesignArtifactBootstrapHtml();

    expect(html).toContain("renderCommentPins(data.comments)");
    expect(html).toContain("data-trace-comment-layer");
    expect(html).toContain("data-trace-comment-pin");
    expect(html).toContain('candidate.getAttribute("data-el") === anchor.dataEl');
    expect(html).toContain('pin.textContent = comment.body || "Comment"');
    expect(html).toContain('type: "trace:artifact:rendered", pinCount: pinCount');
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
        contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
        publishedAt: { not: null },
      },
      select: { id: true, organizationId: true, html: true, htmlStorageKey: true },
    });
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.end).toHaveBeenCalledWith("Not found");
  });

  it("serves published artifact HTML with isolation headers", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce({
      id: "artifact-1",
      organizationId: "org-1",
      html: "",
      htmlStorageKey: "uploads/org-1/design-artifacts/artifact-1.html",
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
    expect(storageMock.getObject).toHaveBeenCalledWith(
      "uploads/org-1/design-artifacts/artifact-1.html",
    );
    expect(response.send).toHaveBeenCalledWith(
      "<!doctype html><html><body>Published</body></html>",
    );
  });
});
