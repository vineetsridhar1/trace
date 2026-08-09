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
    agentCapabilities: [
      "resource:list",
      "session:list",
      "session:create",
      "session:read",
      "session:events",
      "session:send",
      "session:run",
      "session:stop",
      "session:archive",
    ],
  } as Context;
}

describe("agent GraphQL authorization", () => {
  it("allows an approved operation for a visible session", () => {
    const resolver = vi.fn(() => "ok");
    const restricted = restrictAgentRootResolvers("Query", { session: resolver });

    expect(restricted.session(null, { id: "session-a" }, context("session-a"), null)).toBe("ok");
    expect(restricted.session(null, { id: "session-b" }, context("session-a"), null)).toBe("ok");
  });

  it("rejects non-allowlisted root fields", () => {
    const restricted = restrictAgentRootResolvers("Query", { myOrganizations: () => [] });
    expect(() => restricted.myOrganizations(null, {}, context("session-a"), null)).toThrow(
      "cannot perform Query.myOrganizations",
    );
  });

  it("requires event snapshots to use a session scope", () => {
    const restricted = restrictAgentRootResolvers("Query", { events: () => [] });
    expect(() =>
      restricted.events(
        null,
        { scope: { type: "channel", id: "channel-a" } },
        context("session-a"),
        null,
      ),
    ).toThrow("only query session-scoped events");
  });

  it("rejects cross-organization list requests", () => {
    const restricted = restrictAgentRootResolvers("Query", { sessions: () => [] });
    expect(() =>
      restricted.sessions(null, { organizationId: "org-2" }, context("session-a"), null),
    ).toThrow("cannot access another organization");
  });
});
