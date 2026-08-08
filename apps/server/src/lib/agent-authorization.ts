import { GraphQLError } from "graphql";
import type { Context } from "../context.js";

type RootOperation = "Query" | "Mutation" | "Subscription";

const ALLOWED_FIELDS: Record<RootOperation, Readonly<Record<string, string>>> = {
  Query: {
    session: "session:read",
    events: "session:events",
  },
  Mutation: {
    sendSessionMessage: "session:send",
  },
  Subscription: {
    sessionEvents: "session:events",
  },
};

function forbidden(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

function assertAgentRequest(
  ctx: Context,
  operation: RootOperation,
  field: string,
  args: Record<string, unknown>,
): void {
  if (!ctx.agentSessionId) return;

  const capability = ALLOWED_FIELDS[operation][field];
  if (!capability || !ctx.agentCapabilities?.includes(capability)) {
    forbidden(`The session credential cannot perform ${operation}.${field}`);
  }

  const requestedSessionId =
    typeof args.sessionId === "string"
      ? args.sessionId
      : typeof args.id === "string"
        ? args.id
        : null;
  if (field === "events") {
    const scope = args.scope;
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
      forbidden("Session credentials must query events with a session scope");
    }
    const typedScope = scope as { type?: unknown; id?: unknown };
    if (typedScope.type !== "session" || typedScope.id !== ctx.agentSessionId) {
      forbidden("The session credential cannot access events from another scope");
    }
    return;
  }
  if (requestedSessionId !== ctx.agentSessionId) {
    forbidden("The session credential cannot access another session");
  }
}

type ResolverFunction = (...args: unknown[]) => unknown;

function wrapFunction(
  resolver: ResolverFunction,
  operation: RootOperation,
  field: string,
): ResolverFunction {
  return (...resolverArgs: unknown[]) => {
    const args = (resolverArgs[1] ?? {}) as Record<string, unknown>;
    const ctx = resolverArgs[2] as Context;
    assertAgentRequest(ctx, operation, field, args);
    return Reflect.apply(resolver, undefined, resolverArgs);
  };
}

export function restrictAgentRootResolvers<T extends Record<string, unknown>>(
  operation: RootOperation,
  resolvers: T,
): T {
  const restricted = Object.entries(resolvers).map(([field, resolver]) => {
    if (typeof resolver === "function") {
      return [field, wrapFunction(resolver as ResolverFunction, operation, field)];
    }
    if (resolver && typeof resolver === "object" && "subscribe" in resolver) {
      const subscription = resolver as Record<string, unknown>;
      if (typeof subscription.subscribe === "function") {
        return [
          field,
          {
            ...subscription,
            subscribe: wrapFunction(subscription.subscribe as ResolverFunction, operation, field),
          },
        ];
      }
    }
    return [field, resolver];
  });
  return Object.fromEntries(restricted) as T;
}
