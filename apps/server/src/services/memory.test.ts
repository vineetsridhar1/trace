import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DerivedMemory } from "@prisma/client";
import { memoryService } from "./memory.js";

vi.mock("../lib/db.js", () => ({
  prisma: {
    derivedMemory: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    chat: {
      findMany: vi.fn(),
    },
    channel: {
      findMany: vi.fn(),
    },
    session: {
      findMany: vi.fn(),
    },
    ticket: {
      findMany: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("./embedding.js", () => ({
  embeddingService: {
    isConfigured: vi.fn().mockReturnValue(false),
    embed: vi.fn(),
  },
}));

function memory(overrides: Partial<DerivedMemory>): DerivedMemory {
  return {
    id: "mem-1",
    organizationId: "org-1",
    kind: "fact",
    subjectType: "ticket",
    subjectId: "ticket-1",
    sourceScopeType: "channel",
    sourceScopeId: "channel-1",
    sourceIsDm: false,
    startEventId: "evt-1",
    endEventId: "evt-2",
    sourceType: "auto",
    content: "Default memory",
    structuredData: {},
    confidence: 0.8,
    validFrom: new Date("2026-04-04T00:00:00Z"),
    validTo: null,
    supersededBy: null,
    createdAt: new Date("2026-04-04T00:00:00Z"),
    updatedAt: new Date("2026-04-04T00:00:00Z"),
    ...overrides,
  } as DerivedMemory;
}

describe("memoryService visibility", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("../lib/db.js");
    (prisma.chat.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.channel.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.session.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.project.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("keeps cross-scope recall limited to same-project and org-shared non-chat memories", async () => {
    const { prisma } = await import("../lib/db.js");

    (prisma.derivedMemory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      memory({
        id: "same-scope",
        subjectType: "ticket",
        subjectId: "ticket-1",
        sourceScopeType: "channel",
        sourceScopeId: "channel-1",
        content: "Same scope memory",
      }),
      memory({
        id: "same-project",
        subjectType: "ticket",
        subjectId: "ticket-2",
        sourceScopeType: "ticket",
        sourceScopeId: "ticket-2",
        content: "Same project ticket memory",
      }),
      memory({
        id: "org-wide",
        subjectType: "repo",
        subjectId: "repo-1",
        sourceScopeType: "session",
        sourceScopeId: "session-1",
        content: "Org-wide repo memory",
      }),
      memory({
        id: "unrelated-project",
        subjectType: "ticket",
        subjectId: "ticket-9",
        sourceScopeType: "ticket",
        sourceScopeId: "ticket-9",
        content: "Unrelated project ticket memory",
      }),
      memory({
        id: "other-chat",
        subjectType: "user",
        subjectId: "user-2",
        sourceScopeType: "chat",
        sourceScopeId: "chat-2",
        content: "Other group chat memory",
      }),
      memory({
        id: "dm-memory",
        subjectType: "user",
        subjectId: "user-3",
        sourceScopeType: "chat",
        sourceScopeId: "chat-dm",
        sourceIsDm: true,
        content: "DM memory",
      }),
    ]);

    (prisma.channel.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "channel-1", projects: [{ projectId: "project-1" }] },
    ]);
    (prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "ticket-2", projects: [{ projectId: "project-1" }] },
      { id: "ticket-9", projects: [{ projectId: "project-9" }] },
    ]);
    (prisma.session.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "session-1", projects: [{ projectId: "project-9" }] },
    ]);
    (prisma.chat.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "chat-2", type: "group" },
      { id: "chat-dm", type: "dm" },
    ]);

    const results = await memoryService.fetchForContext({
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      isDm: false,
      relevantSubjects: [],
      tokenBudget: 10_000,
    });

    expect(results.map((result) => result.id)).toEqual([
      "same-scope",
      "same-project",
      "org-wide",
    ]);
  });

  it("only returns safe org-wide memories when no scope context is provided", async () => {
    const { prisma } = await import("../lib/db.js");

    (prisma.derivedMemory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      memory({
        id: "repo-memory",
        subjectType: "repo",
        sourceScopeType: "ticket",
        sourceScopeId: "ticket-1",
        content: "Repo decision",
      }),
      memory({
        id: "chat-memory",
        subjectType: "user",
        sourceScopeType: "chat",
        sourceScopeId: "chat-2",
        content: "Group chat memory",
      }),
      memory({
        id: "ticket-memory",
        subjectType: "ticket",
        sourceScopeType: "ticket",
        sourceScopeId: "ticket-2",
        content: "Ticket-local memory",
      }),
    ]);

    const results = await memoryService.search({
      organizationId: "org-1",
      query: "memory",
    });

    expect(results.map((result) => result.id)).toEqual(["repo-memory"]);
  });
});
