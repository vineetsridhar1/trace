import { Kind, parse, type FieldNode, type GraphQLResolveInfo } from "graphql";
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

function infoFor(source: string): GraphQLResolveInfo {
  const document = parse(source);
  const operation = document.definitions.find(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );
  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION)
    throw new Error("Missing operation");
  const fieldNode = operation.selectionSet.selections[0];
  if (!fieldNode || fieldNode.kind !== Kind.FIELD) throw new Error("Missing root field");
  const fragments = Object.fromEntries(
    document.definitions
      .filter((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)
      .map((fragment) => [fragment.name.value, fragment]),
  );
  return { fieldNodes: [fieldNode as FieldNode], fragments } as unknown as GraphQLResolveInfo;
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

  it("allows only the nested fields required by the session CLI", () => {
    const resolver = vi.fn(() => "ok");
    const restricted = restrictAgentRootResolvers("Query", { session: resolver });

    expect(
      restricted.session(
        null,
        { id: "session-a" },
        context("session-a"),
        infoFor(`query { session(id: "session-a") { id channel { id repo { id name } } } }`),
      ),
    ).toBe("ok");
  });

  it("rejects sensitive nested fields even below an allowlisted root", () => {
    const restricted = restrictAgentRootResolvers("Query", { channel: () => ({}) });

    expect(() =>
      restricted.channel(
        null,
        { id: "channel-a" },
        context("session-a"),
        infoFor(`query { channel(id: "channel-a") { id owner { email organizations { role } } } }`),
      ),
    ).toThrow("cannot select Query.channel.owner");
  });

  it("allows only the start-session inputs exposed by the managed CLI", () => {
    const resolver = vi.fn(() => "ok");
    const restricted = restrictAgentRootResolvers("Mutation", { startSession: resolver });
    const info = infoFor(`mutation { startSession(input: {}) { id } }`);

    expect(
      restricted.startSession(
        null,
        { input: { clientMutationId: "start-1", prompt: "Review", repoId: "repo-1" } },
        context("session-a"),
        info,
      ),
    ).toBe("ok");
    expect(() =>
      restricted.startSession(
        null,
        { input: { repoId: "repo-1", worktreePath: "/Users/owner/private" } },
        context("session-a"),
        info,
      ),
    ).toThrow("cannot pass Mutation.startSession.input.worktreePath");
  });

  it("rejects non-CLI nested query filters", () => {
    const restricted = restrictAgentRootResolvers("Query", { sessions: () => [] });
    expect(() =>
      restricted.sessions(
        null,
        { organizationId: "org-1", filters: { includeArchived: true, userId: "owner-2" } },
        context("session-a"),
        infoFor(`query { sessions(organizationId: "org-1") { id } }`),
      ),
    ).toThrow("cannot pass Query.sessions.filters.userId");
  });
});
