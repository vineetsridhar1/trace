import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  toGraphQLError,
} from "./errors.js";

describe("errors", () => {
  it("maps authentication errors to GraphQL unauthenticated errors", () => {
    const error = toGraphQLError(new AuthenticationError("bad token"));

    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.message).toBe("bad token");
    expect(error.extensions.code).toBe("UNAUTHENTICATED");
  });

  it("maps authorization errors to GraphQL forbidden errors", () => {
    const error = toGraphQLError(new AuthorizationError("nope"));

    expect(error.message).toBe("nope");
    expect(error.extensions.code).toBe("FORBIDDEN");
  });

  it("maps not found errors to GraphQL not found errors", () => {
    const error = toGraphQLError(new NotFoundError("Ticket", "t-1"));

    expect(error.message).toBe("Ticket not found: t-1");
    expect(error.extensions.code).toBe("NOT_FOUND");
  });

  it("maps validation errors to bad user input", () => {
    const error = toGraphQLError(new ValidationError("broken"));

    expect(error.message).toBe("broken");
    expect(error.extensions.code).toBe("BAD_USER_INPUT");
  });

  it("maps generic errors to internal server errors", () => {
    const error = toGraphQLError(new Error("boom"));

    expect(error.message).toBe("boom");
    expect(error.extensions.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("handles non-error throwables", () => {
    const error = toGraphQLError("boom");

    expect(error.message).toBe("Unknown error");
    expect(error.extensions.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
