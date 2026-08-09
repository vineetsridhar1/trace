import { TRACE_CLI_CAPABILITIES, traceCliOperations } from "@trace/cli-contract";
import { Kind, parse, type FieldNode, type GraphQLResolveInfo } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { Context } from "../context.js";
import { assertAllowedArguments, restrictAgentRootResolvers } from "./agent-authorization.js";

function context(sessionId: string): Context {
  return {
    userId: "owner-1",
    organizationId: "org-1",
    clientSource: "cli",
    role: null,
    actorType: "agent",
    agentSessionId: sessionId,
    agentSessionGroupId: "group-a",
    agentCapabilities: TRACE_CLI_CAPABILITIES,
  } as Context;
}

function infoFor(source: string): GraphQLResolveInfo {
  const document = parse(source);
  const operation = document.definitions.find(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );
  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error("Missing operation");
  }
  const fieldNode = operation.selectionSet.selections[0];
  if (!fieldNode || fieldNode.kind !== Kind.FIELD) throw new Error("Missing root field");
  return {
    operation,
    fieldNodes: [fieldNode as FieldNode],
    fragments: {},
  } as unknown as GraphQLResolveInfo;
}

const ROOT_OPERATION = {
  query: "Query",
  mutation: "Mutation",
  subscription: "Subscription",
} as const;

describe("agent GraphQL authorization", () => {
  it("validates fields nested inside input arrays", () => {
    const definition = {
      ...traceCliOperations.startSession,
      argumentPaths: ["input.items.id"],
    };

    expect(() =>
      assertAllowedArguments(definition, "Mutation", "startSession", {
        input: { items: [{ id: "allowed", privileged: true }] },
      }),
    ).toThrow("cannot pass Mutation.startSession.input.items.privileged");
  });

  it("accepts every canonical managed CLI operation", () => {
    for (const definition of Object.values(traceCliOperations)) {
      const resolver = vi.fn(() => "ok");
      const operation = ROOT_OPERATION[definition.type];
      const restricted = restrictAgentRootResolvers(operation, {
        [definition.rootField]: resolver,
      });
      const args = (() => {
        if (definition.rootField === "events") {
          return { organizationId: "org-1", scope: { type: "session", id: "session-a" } };
        }
        if (definition.rootField === "appIntegrationBindings") {
          return { sessionGroupId: "group-a" };
        }
        if (definition.rootField === "upsertAppIntegrationBinding") {
          return { input: { sessionGroupId: "group-a" } };
        }
        if (definition.rootField === "deleteAppIntegrationBinding") {
          return { id: "binding-a", sessionGroupId: "group-a" };
        }
        return {};
      })();
      expect(
        restricted[definition.rootField]?.(
          null,
          args,
          context("session-a"),
          infoFor(definition.document),
        ),
      ).toBe("ok");
    }
  });

  it("limits app integration configuration to the agent's current group", () => {
    const restricted = restrictAgentRootResolvers("Mutation", {
      upsertAppIntegrationBinding: () => ({}),
    });
    expect(() =>
      restricted.upsertAppIntegrationBinding(
        null,
        { input: { sessionGroupId: "group-b" } },
        context("session-a"),
        infoFor(traceCliOperations.upsertAppIntegrationBinding.document),
      ),
    ).toThrow("only configure its current application");
  });

  it("allows an approved operation for any session visible to the owner", () => {
    const resolver = vi.fn(() => "ok");
    const restricted = restrictAgentRootResolvers("Query", { session: resolver });
    const info = infoFor(traceCliOperations.session.document);

    expect(restricted.session(null, { id: "session-a" }, context("session-a"), info)).toBe("ok");
    expect(restricted.session(null, { id: "session-b" }, context("session-a"), info)).toBe("ok");
  });

  it("rejects unregistered operations and modified registered documents", () => {
    const restricted = restrictAgentRootResolvers("Query", {
      myOrganizations: () => [],
      session: () => ({}),
    });
    expect(() =>
      restricted.myOrganizations(
        null,
        {},
        context("session-a"),
        infoFor(`query Unregistered { myOrganizations { id } }`),
      ),
    ).toThrow("cannot perform Query.myOrganizations");

    expect(() =>
      restricted.session(
        null,
        { id: "session-a" },
        context("session-a"),
        infoFor(
          traceCliOperations.session.document.replace(
            "repo { id name }",
            "repo { id name remoteUrl }",
          ),
        ),
      ),
    ).toThrow("cannot modify the registered operation TraceCliSession");
  });

  it("requires event snapshots to use a session scope", () => {
    const restricted = restrictAgentRootResolvers("Query", { events: () => [] });
    expect(() =>
      restricted.events(
        null,
        { organizationId: "org-1", scope: { type: "channel", id: "channel-a" } },
        context("session-a"),
        infoFor(traceCliOperations.sessionEvents.document),
      ),
    ).toThrow("only query session-scoped events");
  });

  it("rejects cross-organization requests", () => {
    const restricted = restrictAgentRootResolvers("Query", { sessions: () => [] });
    expect(() =>
      restricted.sessions(
        null,
        { organizationId: "org-2" },
        context("session-a"),
        infoFor(traceCliOperations.sessions.document),
      ),
    ).toThrow("cannot access another organization");
  });

  it("allows only the start-session inputs declared by the managed operation", () => {
    const resolver = vi.fn(() => "ok");
    const restricted = restrictAgentRootResolvers("Mutation", { startSession: resolver });
    const info = infoFor(traceCliOperations.startSession.document);

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

  it("rejects nested variables outside the registered operation contract", () => {
    const restricted = restrictAgentRootResolvers("Query", { sessions: () => [] });
    expect(() =>
      restricted.sessions(
        null,
        { organizationId: "org-1", filters: { includeArchived: true, userId: "owner-2" } },
        context("session-a"),
        infoFor(traceCliOperations.sessions.document),
      ),
    ).toThrow("cannot pass Query.sessions.filters.userId");
  });
});
