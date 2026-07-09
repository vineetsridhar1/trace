import { beforeEach, describe, expect, it, vi } from "vitest";

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
      html: "<!doctype html><html><body><main data-el=\"generated\">Generated</main></body></html>",
      metadata: { generator: "llm", model: "test-model" },
    }),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { designGenerationService } from "./design-generation.js";
import { artifactService } from "./artifact.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;
const designGenerationServiceMock = designGenerationService as any;

function designArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "artifact-1",
    sessionGroupId: "group-1",
    organizationId: "org-1",
    parentArtifactId: null,
    promptEventId: null,
    prompt: "Make a dashboard",
    title: "Dashboard",
    contentType: "text/html+trace-design",
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
    expect(artifact.metadata).toMatchObject({
      generator: "llm",
      source: "createDesignArtifact",
    });
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

  it("records PDF export requests without claiming completion", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce(designArtifact());

    await artifactService.exportDesignArtifactPdf({
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
  });

  it("emits design comments with artifact anchors", async () => {
    prismaMock.artifact.findFirst.mockResolvedValueOnce(designArtifact());

    await artifactService.commentDesignArtifact({
      artifactId: "artifact-1",
      organizationId: "org-1",
      actorId: "user-1",
      body: " Tighten the header spacing. ",
      anchor: { type: "artifact", x: 0.4, y: 0.2 },
      sendToAgent: true,
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
        sendToAgent: true,
      },
      actorType: "user",
      actorId: "user-1",
    });
  });
});
