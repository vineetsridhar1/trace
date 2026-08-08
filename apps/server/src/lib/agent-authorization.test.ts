import { describe, expect, it, vi } from "vitest";
import type { Context } from "../context.js";
import { restrictAgentRootResolvers } from "./agent-authorization.js";

function context(sessionId: string): Context {
  return {
    userId: "owner-1",
    organizationId: "org-1",
    clientSource: "cli",
    role: null,
    actorType: "agent",
    agentSessionId: sessionId,
    agentCapabilities: ["session:read", "session:events", "session:send"],
  } as Context;
}

describe("agent GraphQL authorization", () => {
  it("allows an approved operation only for the bound session", () => {
    const resolver = vi.fn(() => "ok");
    const restricted = restrictAgentRootResolvers("Query", { session: resolver });

    expect(restricted.session(null, { id: "session-a" }, context("session-a"), null)).toBe("ok");
    expect(() => restricted.session(null, { id: "session-b" }, context("session-a"), null)).toThrow(
      "cannot access another session",
    );
  });

  it("rejects non-allowlisted root fields", () => {
    const restricted = restrictAgentRootResolvers("Query", { myOrganizations: () => [] });
    expect(() => restricted.myOrganizations(null, {}, context("session-a"), null)).toThrow(
      "cannot perform Query.myOrganizations",
    );
  });

  it("requires event snapshots to be scoped to the bound session", () => {
    const restricted = restrictAgentRootResolvers("Query", { events: () => [] });
    expect(() =>
      restricted.events(
        null,
        { scope: { type: "session", id: "session-b" } },
        context("session-a"),
        null,
      ),
    ).toThrow("cannot access events from another scope");
  });
});
