import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { resolveAutonomyMode, updateScopeAiMode } from "./scope-autonomy.js";

const prismaMock = prisma as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

describe("resolveAutonomyMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns scope-level override when set on chat", async () => {
    prismaMock.chat.findUnique.mockResolvedValueOnce({ aiMode: "act" });

    const result = await resolveAutonomyMode({
      scopeType: "chat",
      scopeId: "chat-1",
      organizationId: "org-1",
      isDm: false,
      orgDefault: "observe",
    });

    expect(result).toBe("act");
  });

  it("returns scope-level override when set on ticket", async () => {
    prismaMock.ticket.findUnique.mockResolvedValueOnce({ aiMode: "suggest" });

    const result = await resolveAutonomyMode({
      scopeType: "ticket",
      scopeId: "ticket-1",
      organizationId: "org-1",
      orgDefault: "act",
    });

    expect(result).toBe("suggest");
  });

  it("returns project-level override when scope has no override", async () => {
    prismaMock.ticket.findUnique.mockResolvedValueOnce({ aiMode: null });
    prismaMock.ticketProject.findMany.mockResolvedValueOnce([{ projectId: "proj-1" }]);
    prismaMock.project.findMany.mockResolvedValueOnce([{ aiMode: "suggest" }]);

    const result = await resolveAutonomyMode({
      scopeType: "ticket",
      scopeId: "ticket-1",
      organizationId: "org-1",
      orgDefault: "act",
    });

    expect(result).toBe("suggest");
  });

  it("returns most restrictive project override when multiple projects", async () => {
    prismaMock.ticket.findUnique.mockResolvedValueOnce({ aiMode: null });
    prismaMock.ticketProject.findMany.mockResolvedValueOnce([
      { projectId: "proj-1" },
      { projectId: "proj-2" },
    ]);
    prismaMock.project.findMany.mockResolvedValueOnce([
      { aiMode: "act" },
      { aiMode: "observe" },
    ]);

    const result = await resolveAutonomyMode({
      scopeType: "ticket",
      scopeId: "ticket-1",
      organizationId: "org-1",
      orgDefault: "act",
    });

    expect(result).toBe("observe");
  });

  it("DMs default to observe when no explicit override", async () => {
    prismaMock.chat.findUnique.mockResolvedValueOnce({ aiMode: null });

    const result = await resolveAutonomyMode({
      scopeType: "chat",
      scopeId: "chat-1",
      organizationId: "org-1",
      isDm: true,
      orgDefault: "act",
    });

    expect(result).toBe("observe");
  });

  it("group chats default to suggest when no explicit override", async () => {
    prismaMock.chat.findUnique.mockResolvedValueOnce({ aiMode: null });

    const result = await resolveAutonomyMode({
      scopeType: "chat",
      scopeId: "chat-1",
      organizationId: "org-1",
      isDm: false,
      orgDefault: "act",
    });

    expect(result).toBe("suggest");
  });

  it("falls back to org default for non-chat scopes with no overrides", async () => {
    prismaMock.channel.findUnique.mockResolvedValueOnce({ aiMode: null });
    prismaMock.channelProject.findMany.mockResolvedValueOnce([]);

    const result = await resolveAutonomyMode({
      scopeType: "channel",
      scopeId: "channel-1",
      organizationId: "org-1",
      orgDefault: "act",
    });

    expect(result).toBe("act");
  });

  it("null override falls through to parent/org default", async () => {
    prismaMock.chat.findUnique.mockResolvedValueOnce({ aiMode: null });

    const result = await resolveAutonomyMode({
      scopeType: "chat",
      scopeId: "chat-1",
      organizationId: "org-1",
      isDm: true,
      orgDefault: "act",
    });

    // DM defaults to observe, not org default
    expect(result).toBe("observe");
  });

  it("scope override wins over project override", async () => {
    prismaMock.ticket.findUnique.mockResolvedValueOnce({ aiMode: "act" });

    const result = await resolveAutonomyMode({
      scopeType: "ticket",
      scopeId: "ticket-1",
      organizationId: "org-1",
      orgDefault: "observe",
    });

    // Scope override wins — project is never queried
    expect(result).toBe("act");
    expect(prismaMock.ticketProject.findMany).not.toHaveBeenCalled();
  });
});

describe("updateScopeAiMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates chat aiMode", async () => {
    prismaMock.chat.update.mockResolvedValueOnce({});

    await updateScopeAiMode({ scopeType: "chat", scopeId: "chat-1", aiMode: "observe" });

    expect(prismaMock.chat.update).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: { aiMode: "observe" },
    });
  });

  it("clears override when aiMode is null", async () => {
    prismaMock.ticket.update.mockResolvedValueOnce({});

    await updateScopeAiMode({ scopeType: "ticket", scopeId: "ticket-1", aiMode: null });

    expect(prismaMock.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { aiMode: null },
    });
  });

  it("throws for unsupported scope type", async () => {
    await expect(
      updateScopeAiMode({ scopeType: "session", scopeId: "sess-1", aiMode: "act" }),
    ).rejects.toThrow("Cannot set aiMode on scope type: session");
  });
});
