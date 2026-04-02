import { GraphQLError } from "graphql";

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class BridgeAccessRequiredError extends Error {
  constructor(
    public runtimeId: string,
    public runtimeLabel: string,
    public ownerUserId: string,
  ) {
    super("Bridge access verification required");
    this.name = "BridgeAccessRequiredError";
  }
}

/**
 * Convert domain errors to GraphQL errors with proper extensions.
 * Call this in resolvers to get consistent error codes in responses.
 */
export function toGraphQLError(error: unknown): GraphQLError {
  if (error instanceof AuthenticationError) {
    return new GraphQLError(error.message, {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  if (error instanceof AuthorizationError) {
    return new GraphQLError(error.message, {
      extensions: { code: "FORBIDDEN" },
    });
  }
  if (error instanceof NotFoundError) {
    return new GraphQLError(error.message, {
      extensions: { code: "NOT_FOUND" },
    });
  }
  if (error instanceof ValidationError) {
    return new GraphQLError(error.message, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  if (error instanceof BridgeAccessRequiredError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: "BRIDGE_ACCESS_REQUIRED",
        runtimeId: error.runtimeId,
        runtimeLabel: error.runtimeLabel,
        ownerUserId: error.ownerUserId,
      },
    });
  }
  if (error instanceof Error) {
    return new GraphQLError(error.message, {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }
  return new GraphQLError("Unknown error", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}
