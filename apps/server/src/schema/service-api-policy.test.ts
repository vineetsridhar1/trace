import { parse } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { Context } from "../context.js";
import {
  assertServiceOperationAllowed,
  assertServicePermissions,
  assertServiceTokenDocumentAllowed,
  guardServiceTokenRootResolvers,
} from "./service-api-policy.js";

function context(scopes: Context["serviceApiScopes"], authKind: Context["authKind"] = "service") {
  return {
    authKind,
    serviceApiScopes: scopes,
  } as Context;
}

describe("service API policy", () => {
  it("allows registered operations with their required permissions", () => {
    expect(() =>
      assertServiceOperationAllowed(context(["sessions_start"]), "Mutation", "startServiceSession"),
    ).not.toThrow();
    expect(() =>
      assertServiceOperationAllowed(
        context(["sessions_status_read"]),
        "Query",
        "serviceSessionStatus",
      ),
    ).not.toThrow();
  });

  it("supports reusable all-of and any-of permission requirements", () => {
    expect(() =>
      assertServicePermissions(["sessions_start"], { anyOf: ["sessions_start"] }),
    ).not.toThrow();
    expect(() =>
      assertServicePermissions(["sessions_start"], {
        allOf: ["sessions_start", "sessions_status_read"],
      }),
    ).toThrow("sessions_status_read");
  });

  it("rejects missing scopes and unregistered fields", () => {
    expect(() =>
      assertServiceOperationAllowed(context([]), "Mutation", "startServiceSession"),
    ).toThrow("sessions_start");
    expect(() => assertServiceOperationAllowed(context([]), "Query", "sessions")).toThrow(
      "not authorized",
    );
  });

  it("preflights aliases and fragments before any resolver executes", () => {
    const document = parse(`
      mutation Start {
        allowed: startServiceSession(input: {
          idempotencyKey: "request-1",
          prompt: "Run"
        }) { id }
        ...ForbiddenMutation
      }
      fragment ForbiddenMutation on Mutation {
        terminateSession(id: "session-1")
      }
    `);
    expect(() =>
      assertServiceTokenDocumentAllowed(document, "Start", context(["sessions_start"])),
    ).toThrow("not authorized");
  });

  it("rejects introspection and subscriptions for service credentials", () => {
    expect(() =>
      assertServiceTokenDocumentAllowed(
        parse("query { __schema { queryType { name } } }"),
        null,
        context([]),
      ),
    ).toThrow("not authorized");
    expect(() =>
      assertServiceTokenDocumentAllowed(
        parse('subscription { orgEvents(organizationId: "org-1") { id } }'),
        null,
        context([]),
      ),
    ).toThrow("not authorized");
  });

  it("leaves session and mobile credentials unchanged", () => {
    expect(() =>
      assertServiceOperationAllowed(context([], "session"), "Query", "sessions"),
    ).not.toThrow();
  });

  it("guards actual root resolver invocation", async () => {
    const resolver = vi.fn().mockReturnValue("ok");
    const guarded = guardServiceTokenRootResolvers("Query", {
      serviceSessionStatus: resolver,
    }).serviceSessionStatus as (
      parent: unknown,
      args: Record<string, unknown>,
      ctx: Context,
      info: { fieldName: string },
    ) => unknown;

    expect(() => guarded({}, {}, context([]), { fieldName: "serviceSessionStatus" })).toThrow(
      "sessions_status_read",
    );
    expect(
      guarded({}, {}, context(["sessions_status_read"]), { fieldName: "serviceSessionStatus" }),
    ).toBe("ok");
    expect(resolver).toHaveBeenCalledOnce();
  });
});
