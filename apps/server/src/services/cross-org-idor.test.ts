/**
 * Regression tests that lock in the Critical cross-org IDOR fixes
 * (F1, F2, F3, F4, F13 from the security audit).
 *
 * Each test simulates a caller from Org A invoking a service method with an
 * entity ID that actually belongs to Org B, and asserts the service rejects
 * the call instead of returning / mutating the cross-org entity.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({ id: "evt_1" }) },
}));

vi.mock("./inbox.js", () => ({
  inboxService: {
    resolveBySource: vi.fn().mockResolvedValue(undefined),
    createItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./org-member.js", () => ({
  orgMemberService: {
    assertAdmin: vi.fn().mockResolvedValue({ role: "admin" }),
  },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    send: vi.fn(),
    bindSession: vi.fn(),
    unbindSession: vi.fn(),
    destroyRuntime: vi.fn(),
    transitionRuntime: vi.fn(),
    getRuntimeForSession: vi.fn(),
  },
}));

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    destroyAllForSession: vi.fn(),
    destroyAllForSessionGroup: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { SessionService } from "./session.js";
import { TicketService } from "./ticket.js";
import { updateScopeAiMode } from "./scope-autonomy.js";

type PrismaMock = ReturnType<
  typeof import("../../test/helpers.js").createPrismaMock
>;
const prismaMock = prisma as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
});

// When findFirst/findFirstOrThrow is called with `where: { id, organizationId }`
// and the stored entity belongs to a different org, the mocked prisma should
// behave like the real one: resolve with null (for findFirst) or throw (for
// findFirstOrThrow). We configure the mocks per test.

// Simulate a real Prisma WHERE clause: the row lives in `storedOrg` but the
// query filters by `where.organizationId`. If they disagree, no row is found.
function simulateFindFirst(storedOrg: string) {
  return async (args: unknown) => {
    const where = (args as { where: { id: string; organizationId?: string } })
      .where;
    if (where.organizationId && where.organizationId !== storedOrg) return null;
    return { id: where.id, organizationId: storedOrg };
  };
}

function simulateFindFirstOrThrow(
  storedOrg: string,
  extra: Record<string, unknown> = {},
) {
  return async (args: unknown) => {
    const where = (args as { where: { id: string; organizationId?: string } })
      .where;
    if (where.organizationId && where.organizationId !== storedOrg) {
      throw new Error("No record found");
    }
    return { id: where.id, organizationId: storedOrg, ...extra };
  };
}

describe("sessionService.get (F1)", () => {
  it("returns null when the session belongs to a different org", async () => {
    prismaMock.session.findFirst.mockImplementationOnce(simulateFindFirst("orgB"));

    const svc = new SessionService();
    const result = await svc.get("sess_b", "orgA");
    expect(result).toBeNull();
  });
});

describe("sessionService.run (F13)", () => {
  it("throws when the session belongs to a different org", async () => {
    prismaMock.session.findFirstOrThrow.mockImplementationOnce(
      simulateFindFirstOrThrow("orgB", { agentStatus: "idle", sessionStatus: "active" }),
    );

    const svc = new SessionService();
    await expect(svc.run("sess_b", null, undefined, "orgA")).rejects.toThrow();
  });
});

describe("sessionService.terminate (F13)", () => {
  it("throws when the session belongs to a different org", async () => {
    prismaMock.session.findFirstOrThrow.mockImplementationOnce(
      simulateFindFirstOrThrow("orgB"),
    );

    const svc = new SessionService();
    await expect(
      svc.terminate("sess_b", "user", "user_a", "orgA"),
    ).rejects.toThrow();
  });
});

describe("sessionService.delete (F13)", () => {
  it("throws when session is in another org and does not delete", async () => {
    prismaMock.session.findFirst.mockImplementationOnce(simulateFindFirst("orgB"));

    const svc = new SessionService();
    await expect(
      svc.delete("sess_b", "user", "user_a", "orgA"),
    ).rejects.toThrow("Session not found or already deleted");
    expect(prismaMock.session.delete).not.toHaveBeenCalled();
  });
});

describe("ticketService.get (F3)", () => {
  it("returns null when the ticket belongs to a different org", async () => {
    prismaMock.ticket.findFirst.mockImplementationOnce(simulateFindFirst("orgB"));

    const svc = new TicketService();
    const result = await svc.get("ticket_b", "orgA");
    expect(result).toBeNull();
  });
});

describe("ticketService.update (F3)", () => {
  it("throws when the ticket belongs to a different org", async () => {
    prismaMock.ticket.findFirstOrThrow.mockImplementationOnce(
      simulateFindFirstOrThrow("orgB", { status: "open" }),
    );

    const svc = new TicketService();
    await expect(
      svc.update("ticket_b", { status: "closed" }, "user", "user_a", "orgA"),
    ).rejects.toThrow();
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });
});

describe("updateScopeAiMode (F4)", () => {
  it("refuses to update a ticket that lives in a different org", async () => {
    prismaMock.ticket.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateScopeAiMode({
        scopeType: "ticket",
        scopeId: "ticket_b",
        aiMode: "act",
        userId: "user_a",
        organizationId: "orgA",
      }),
    ).rejects.toThrow("Ticket not in this organization");
  });

  it("refuses to update a channel in a different org", async () => {
    prismaMock.channel.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateScopeAiMode({
        scopeType: "channel",
        scopeId: "channel_b",
        aiMode: "observe",
        userId: "user_a",
        organizationId: "orgA",
      }),
    ).rejects.toThrow("Channel not in this organization");
  });

  it("refuses to update a chat when caller shares no org with members", async () => {
    prismaMock.chat.findFirst.mockResolvedValueOnce(null);

    await expect(
      updateScopeAiMode({
        scopeType: "chat",
        scopeId: "chat_b",
        aiMode: "suggest",
        userId: "user_a",
        organizationId: "orgA",
      }),
    ).rejects.toThrow("Chat not in this organization");
  });
});
