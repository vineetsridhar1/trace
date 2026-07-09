import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfBuffer = vi.hoisted(() =>
  Buffer.from(
    "%PDF-1.7\n1 0 obj <</Type /Pages /Count 1>> endobj\n2 0 obj <</Type /Page>> endobj\n",
    "latin1",
  ),
);
const storageObjects = vi.hoisted(() => new Map<string, Buffer>());

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
  },
}));

vi.mock("./access.js", () => ({
  assertSessionGroupAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session.js", () => ({
  sessionService: {
    start: vi.fn(),
  },
}));

vi.mock("./design-generation.js", () => ({
  designGenerationService: {
    generateHtml: vi.fn().mockResolvedValue({
      html: '<!doctype html><html><body><main data-el="generated">Generated</main></body></html>',
      metadata: { generator: "llm", model: "test-model" },
    }),
  },
}));

vi.mock("./design-pdf-renderer.js", () => ({
  countPdfPages: (pdf: Buffer) => {
    const text = pdf.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page\b/g);
    return matches && matches.length > 0 ? matches.length : null;
  },
  designPdfRenderer: {
    renderHtmlToPdf: vi.fn().mockResolvedValue(pdfBuffer),
  },
}));

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    putObject: vi.fn(async (key: string, body: Buffer) => {
      storageObjects.set(key, body);
    }),
    getObject: vi.fn(async (key: string) => storageObjects.get(key) ?? Buffer.alloc(0)),
    getGetUrl: vi.fn().mockResolvedValue("https://files.example/design.pdf"),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { designGenerationService } from "./design-generation.js";
import { designPdfRenderer } from "./design-pdf-renderer.js";
import { storage } from "../lib/storage/index.js";
import { sessionService } from "./session.js";
import { artifactService } from "./artifact.js";
import { DESIGN_ARTIFACT_CONTENT_TYPE } from "./design-artifact-html.js";

type MockedDeep<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<T[K]>>
    : T[K] extends object
      ? MockedDeep<T[K]>
      : T[K];
};

const prismaMock = prisma as unknown as MockedDeep<typeof prisma>;
const eventServiceMock = eventService as unknown as MockedDeep<typeof eventService>;
const designGenerationServiceMock = designGenerationService as unknown as MockedDeep<
  typeof designGenerationService
>;
const designPdfRendererMock = designPdfRenderer as unknown as MockedDeep<typeof designPdfRenderer>;
const storageMock = storage as unknown as MockedDeep<typeof storage>;
const sessionServiceMock = sessionService as unknown as MockedDeep<typeof sessionService>;

function designArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "artifact-1",
    sessionGroupId: "group-1",
    organizationId: "org-1",
    parentArtifactId: null,
    promptEventId: null,
    prompt: "Make a dashboard",
    title: "Dashboard",
    contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
    html: `<html><head><style>
    :root {
      --trace-accent: #0f766e;
      --trace-radius: 8px;
    }
    </style></head><body></body></html>`,
    metadata: { generator: "test" },
    publishedAt: null,
    createdById: "user-1",
    createdBy: { id: "user-1" },
    createdAt: new Date("2026-07-09T10:00:00.000Z"),
    updatedAt: new Date("2026-07-09T10:00:00.000Z"),
    sessionGroup: {
      id: "group-1",
      kind: "design",
      channelId: "channel-1",
      organizationId: "org-1",
      sessions: [{ id: "session-1" }],
    },
    ...overrides,
  };
}

describe("artifactService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageObjects.clear();
  });

  it("generates design artifact HTML when caller does not provide HTML", async () => {
    const parent = designArtifact();
    prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
      id: "group-1",
      kind: "design",
      sessions: [{ id: "session-1" }],
    });
    prismaMock.artifact.create.mockImplementationOnce(
      async (args: { data: Record<string, unknown> }) => ({
        ...parent,
        ...args.data,
        id: "artifact-generated",
        parentArtifactId: null,
        createdBy: parent.createdBy,
        createdAt: new Date("2026-07-09T10:01:00.000Z"),
        updatedAt: new Date("2026-07-09T10:01:00.000Z"),
      }),
    );

    const artifact = await artifactService.createDesignArtifact({
      sessionGroupId: "group-1",
      organizationId: "org-1",
      actorId: "user-1",
      prompt: "Make a generated dashboard",
    });

    expect(designGenerationServiceMock.generateHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorId: "user-1",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        prompt: "Make a generated dashboard",
      }),
    );
    expect(artifact.html).toContain("Generated");
    expect(storageMock.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^uploads\/org-1\/design-artifacts\/.+\.html$/),
      expect.any(Buffer),
      "text/html",
    );
    const storedHtml = storageMock.putObject.mock.calls[0]?.[1] as Buffer | undefined;
    expect(storedHtml?.toString("utf8")).toContain("Generated");
    expect(prismaMock.artifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          html: "",
          htmlStorageKey: expect.stringMatching(/^uploads\/org-1\/design-artifacts\/.+\.html$/),
        }),
      }),
    );
    expect(artifact.metadata).toMatchObject({
      generator: "llm",
      source: "createDesignArtifact",
    });
  });

  it("does not create a design artifact when generation returns no HTML", async () => {
    prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
      id: "group-1",
      kind: "design",
      sessions: [{ id: "session-1" }],
    });
    designGenerationServiceMock.generateHtml.mockResolvedValueOnce({
      html: "",
      metadata: { generator: "llm" },
    });

    await expect(
      artifactService.createDesignArtifact({
        sessionGroupId: "group-1",
        organizationId: "org-1",
        actorId: "user-1",
        prompt: "Make a generated dashboard",
      }),
    ).rejects.toThrow("Design generation did not return artifact HTML.");

    expect(prismaMock.artifact.create).not.toHaveBeenCalled();
    expect(storageMock.putObject).not.toHaveBeenCalled();
  });

  it("generates sibling design artifact variants with fan-out metadata", async () => {
    const parent = designArtifact();
    prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
      id: "group-1",
      kind: "design",
      sessions: [{ id: "session-1" }],
    });
    prismaMock.artifact.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        ...parent,
        ...args.data,
        id: `artifact-${String(args.data.metadata && typeof args.data.metadata === "object" && "directionIndex" in args.data.metadata ? (args.data.metadata as Record<string, unknown>).directionIndex : "x")}`,
        parentArtifactId: null,
        createdBy: parent.createdBy,
        createdAt: new Date("2026-07-09T10:01:00.000Z"),
        updatedAt: new Date("2026-07-09T10:01:00.000Z"),
      }),
    );

    const artifacts = await artifactService.generateDesignArtifacts({
      sessionGroupId: "group-1",
      organizationId: "org-1",
      actorId: "user-1",
      prompt: "Make three dashboards",
      directionCount: 3,
    });

    expect(artifacts).toHaveLength(3);
    expect(designGenerationServiceMock.generateHtml).toHaveBeenCalledTimes(3);
    expect(designGenerationServiceMock.generateHtml).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        prompt: expect.stringContaining("variant 1 of 3"),
      }),
    );
    expect(prismaMock.artifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prompt: "Make three dashboards",
          metadata: expect.objectContaining({
            source: "generateDesignArtifacts",
            directionIndex: 0,
            directionCount: 3,
            directionLabel: "Refined product direction",
          }),
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_artifact_created",
        payload: expect.objectContaining({
          directionIndex: 0,
          directionCount: 3,
        }),
      }),
    );
  });

  it("keeps successful design variants when a sibling direction fails", async () => {
    const parent = designArtifact();
    prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
      id: "group-1",
      kind: "design",
      sessions: [{ id: "session-1" }],
    });
    designGenerationServiceMock.generateHtml
      .mockResolvedValueOnce({
        html: "<!doctype html><html><body>First</body></html>",
        metadata: { generator: "llm" },
      })
      .mockRejectedValueOnce(new Error("direction failed"));
    prismaMock.artifact.create.mockImplementationOnce(
      async (args: { data: Record<string, unknown> }) => ({
        ...parent,
        ...args.data,
        id: "artifact-success",
        createdBy: parent.createdBy,
        createdAt: new Date("2026-07-09T10:01:00.000Z"),
        updatedAt: new Date("2026-07-09T10:01:00.000Z"),
      }),
    );

    const artifacts = await artifactService.generateDesignArtifacts({
      sessionGroupId: "group-1",
      organizationId: "org-1",
      actorId: "user-1",
      prompt: "Make two dashboards",
      directionCount: 2,
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.html).toContain("First");
    expect(prismaMock.artifact.create).toHaveBeenCalledTimes(1);
  });

  it("generates iterations with parent HTML context", async () => {
    const parent = designArtifact();
    prismaMock.artifact.findFirst.mockResolvedValueOnce(parent);
    prismaMock.artifact.create.mockImplementationOnce(
      async (args: { data: Record<string, unknown> }) => ({
        ...parent,
        ...args.data,
        id: "artifact-child",
        createdBy: parent.createdBy,
        createdAt: new Date("2026-07-09T10:01:00.000Z"),
        updatedAt: new Date("2026-07-09T10:01:00.000Z"),
      }),
    );

    const artifact = await artifactService.iterateDesignArtifact({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
      prompt: "Make it denser",
    });

    expect(designGenerationServiceMock.generateHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        parentArtifactId: "artifact-1",
        parentHtml: parent.html,
        sessionId: "session-1",
      }),
    );
    expect(artifact.parentArtifactId).toBe("artifact-1");
    expect(artifact.html).toContain("Generated");
  });

  it("passes same-session comparison artifacts into design iteration generation", async () => {
    const parent = designArtifact();
    const comparison = designArtifact({
      id: "artifact-2",
      title: "Alternate dashboard",
      prompt: "Make an alternate dashboard",
      html: "<!doctype html><html><body>Alternate</body></html>",
      metadata: { directionLabel: "Alternate" },
    });
    prismaMock.artifact.findFirst.mockResolvedValueOnce(parent);
    prismaMock.artifact.findMany.mockResolvedValueOnce([comparison]);
    prismaMock.artifact.create.mockImplementationOnce(
      async (args: { data: Record<string, unknown> }) => ({
        ...parent,
        ...args.data,
        id: "artifact-child",
        createdBy: parent.createdBy,
        createdAt: new Date("2026-07-09T10:01:00.000Z"),
        updatedAt: new Date("2026-07-09T10:01:00.000Z"),
      }),
    );

    await artifactService.iterateDesignArtifact({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
      prompt: "Merge the best parts",
      comparisonArtifactIds: ["artifact-2"],
    });

    expect(prismaMock.artifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["artifact-2"] },
          organizationId: "org-1",
          sessionGroupId: "group-1",
        }),
      }),
    );
    expect(designGenerationServiceMock.generateHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        comparisonArtifacts: [
          expect.objectContaining({
            id: "artifact-2",
            title: "Alternate dashboard",
            html: "<!doctype html><html><body>Alternate</body></html>",
            metadata: { directionLabel: "Alternate" },
          }),
        ],
      }),
    );
  });

  it("does not create an artifact iteration when generation returns no HTML", async () => {
    const parent = designArtifact();
    prismaMock.artifact.findFirst.mockResolvedValueOnce(parent);
    designGenerationServiceMock.generateHtml.mockResolvedValueOnce({
      html: "",
      metadata: { generator: "llm" },
    });

    await expect(
      artifactService.iterateDesignArtifact({
        artifactId: "artifact-1",
        organizationId: "org-1",
        actorId: "user-1",
        prompt: "Make it denser",
      }),
    ).rejects.toThrow("Design generation did not return artifact HTML.");

    expect(prismaMock.artifact.create).not.toHaveBeenCalled();
    expect(storageMock.putObject).not.toHaveBeenCalled();
  });

  it("patches provided CSS tokens without dropping existing root variables", async () => {
    const parent = designArtifact();
    prismaMock.artifact.findFirst.mockResolvedValueOnce(parent);
    prismaMock.artifact.create.mockImplementationOnce(
      async (args: { data: Record<string, unknown> }) => ({
        ...parent,
        ...args.data,
        id: "artifact-2",
        parentArtifactId: "artifact-1",
        createdBy: parent.createdBy,
        createdAt: new Date("2026-07-09T10:01:00.000Z"),
        updatedAt: new Date("2026-07-09T10:01:00.000Z"),
      }),
    );

    const artifact = await artifactService.patchDesignArtifactTokens({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
      tokens: { "--trace-accent": "#ef4444" },
    });

    expect(artifact.html).toContain("--trace-accent: #ef4444;");
    expect(artifact.html).toContain("--trace-radius: 8px;");
  });

  it("renders, uploads, and emits completed PDF exports", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce(designArtifact());

    const result = await artifactService.exportDesignArtifactPdf({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "session",
      scopeId: "session-1",
      eventType: "design_export_requested",
      payload: expect.objectContaining({
        artifactId: "artifact-1",
        exportType: "pdf",
        status: "requested",
      }),
      actorType: "user",
      actorId: "user-1",
    });
    expect(designPdfRendererMock.renderHtmlToPdf).toHaveBeenCalledWith({
      html: expect.stringContaining("--trace-accent"),
      artifactId: "artifact-1",
    });
    expect(storageMock.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^uploads\/org-1\/.+-Dashboard\.pdf$/),
      pdfBuffer,
      "application/pdf",
    );
    expect(result).toEqual({ id: "event-1" });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_export_completed",
        payload: expect.objectContaining({
          artifactId: "artifact-1",
          exportType: "pdf",
          status: "completed",
          fileName: "Dashboard.pdf",
          fileKey: expect.stringMatching(/^uploads\/org-1\/.+-Dashboard\.pdf$/),
          fileUrl: "https://files.example/design.pdf",
          byteSize: pdfBuffer.byteLength,
          pageCount: 1,
        }),
        actorType: "system",
        actorId: "system",
      }),
    );
  });

  it("emits failed PDF export completions when rendering fails", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce(designArtifact());
    designPdfRendererMock.renderHtmlToPdf.mockRejectedValueOnce(new Error("chromium missing"));

    await expect(
      artifactService.exportDesignArtifactPdf({
        artifactId: "artifact-1",
        organizationId: "org-1",
        actorId: "user-1",
      }),
    ).rejects.toThrow("chromium missing");

    expect(storageMock.putObject).not.toHaveBeenCalled();
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_export_completed",
        payload: expect.objectContaining({
          artifactId: "artifact-1",
          exportType: "pdf",
          status: "failed",
          error: "chromium missing",
        }),
        actorType: "system",
        actorId: "system",
      }),
    );
  });

  it("emits design comments with artifact anchors", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce(designArtifact());

    await artifactService.commentDesignArtifact({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
      body: " Tighten the header spacing. ",
      anchor: { type: "artifact", x: 0.4, y: 0.2 },
      sendToAgent: false,
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "session",
      scopeId: "session-1",
      eventType: "design_comment_added",
      payload: {
        artifactId: "artifact-1",
        sessionGroupId: "group-1",
        parentArtifactId: null,
        body: "Tighten the header spacing.",
        anchor: { type: "artifact", x: 0.4, y: 0.2 },
        sendToAgent: false,
      },
      actorType: "user",
      actorId: "user-1",
    });
  });

  it("creates an artifact iteration when a comment is sent to the agent", async () => {
    const parent = designArtifact();
    prismaMock.artifact.findFirst.mockResolvedValueOnce(parent).mockResolvedValueOnce(parent);
    prismaMock.artifact.create.mockImplementationOnce(
      async (args: { data: Record<string, unknown> }) => ({
        ...parent,
        ...args.data,
        id: "artifact-from-comment",
        parentArtifactId: parent.id,
        createdBy: parent.createdBy,
        createdAt: new Date("2026-07-09T10:02:00.000Z"),
        updatedAt: new Date("2026-07-09T10:02:00.000Z"),
      }),
    );

    await artifactService.commentDesignArtifact({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
      body: " Tighten the header spacing. ",
      anchor: { type: "element", dataEl: "hero-title" },
      sendToAgent: true,
    });

    expect(designGenerationServiceMock.generateHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        parentArtifactId: "artifact-1",
        parentHtml: parent.html,
        prompt: expect.stringContaining("Tighten the header spacing."),
      }),
    );
    expect(designGenerationServiceMock.generateHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"dataEl":"hero-title"'),
      }),
    );
    expect(prismaMock.artifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentArtifactId: "artifact-1",
          title: expect.stringContaining("Apply this design review comment"),
        }),
      }),
    );
  });

  it("promotes a stored design artifact into a deferred coding session", async () => {
    const htmlStorageKey = "uploads/org-1/design-artifacts/artifact-1.html";
    storageObjects.set(
      htmlStorageKey,
      Buffer.from(
        '<!doctype html><html><body><main data-el="stored">Stored artifact</main></body></html>',
        "utf8",
      ),
    );
    prismaMock.artifact.findFirst.mockResolvedValueOnce(
      designArtifact({
        html: "",
        htmlStorageKey,
      }),
    );
    sessionServiceMock.start.mockResolvedValueOnce({
      id: "session-promoted",
      sessionGroupId: "group-promoted",
    });

    const promotedSession = await artifactService.promoteDesignArtifactToCodingSession({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
      prompt: "Build this into the app.",
    });

    expect(promotedSession).toMatchObject({
      id: "session-promoted",
      sessionGroupId: "group-promoted",
    });
    expect(storageMock.getObject).toHaveBeenCalledWith(htmlStorageKey);
    expect(sessionServiceMock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        createdById: "user-1",
        actorType: "user",
        kind: "coding",
        channelId: "channel-1",
        forkedFromSessionGroupId: "group-1",
        deferRuntimeSelection: true,
        name: "Implement Dashboard",
        prompt: expect.stringContaining("Build this into the app."),
      }),
    );
    expect(sessionServiceMock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('data-el="stored"'),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "session-1",
        eventType: "design_artifact_promoted",
        payload: expect.objectContaining({
          artifactId: "artifact-1",
          sessionGroupId: "group-1",
          promotedSessionId: "session-promoted",
          promotedSessionGroupId: "group-promoted",
        }),
        actorType: "user",
        actorId: "user-1",
      }),
    );
  });
});
