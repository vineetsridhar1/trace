import { GraphQLError } from "graphql";

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
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
  if (error instanceof Error) {
    return new GraphQLError(error.message, {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }
  return new GraphQLError("Unknown error", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}
