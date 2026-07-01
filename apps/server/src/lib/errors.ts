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

/**
 * Raised when a session's selected coding tool isn't installed on the runtime
 * it would run on. Carries the tool id so the client can render tool-specific
 * install instructions.
 */
export class ToolNotInstalledError extends Error {
  readonly tool: string;
  readonly runtimeLabel: string | null;
  constructor(tool: string, runtimeLabel: string | null) {
    super(
      `The selected coding tool is not installed on ${runtimeLabel ?? "this runtime"}.`,
    );
    this.name = "ToolNotInstalledError";
    this.tool = tool;
    this.runtimeLabel = runtimeLabel;
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
  if (error instanceof ToolNotInstalledError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: "TOOL_NOT_INSTALLED",
        tool: error.tool,
        runtimeLabel: error.runtimeLabel,
      },
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
