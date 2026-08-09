import { GraphQLError } from "graphql";
import type { Context } from "../context.js";

type RootOperation = "Query" | "Mutation" | "Subscription";

const ALLOWED_FIELDS: Record<RootOperation, Readonly<Record<string, string>>> = {
  Query: {
    channels: "resource:list",
    channel: "resource:list",
    repos: "resource:list",
    repo: "resource:list",
    projects: "resource:list",
    project: "resource:list",
    sessions: "session:list",
    session: "session:read",
    events: "session:events",
  },
  Mutation: {
    startSession: "session:create",
    sendSessionMessage: "session:send",
    queueSessionMessage: "session:send",
    runSession: "session:run",
    terminateSession: "session:stop",
    archiveSessionGroup: "session:archive",
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

  const input =
    args.input && typeof args.input === "object" && !Array.isArray(args.input)
      ? (args.input as Record<string, unknown>)
      : null;
  const requestedOrganizationId =
    typeof args.organizationId === "string"
      ? args.organizationId
      : typeof args.orgId === "string"
        ? args.orgId
        : typeof input?.organizationId === "string"
          ? input.organizationId
          : null;
  if (requestedOrganizationId && requestedOrganizationId !== ctx.organizationId) {
    forbidden("The session credential cannot access another organization");
  }

  if (field === "events") {
    const scope = args.scope;
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
      forbidden("Session credentials must query events with a session scope");
    }
    const typedScope = scope as { type?: unknown; id?: unknown };
    if (typedScope.type !== "session" || typeof typedScope.id !== "string") {
      forbidden("Session credentials may only query session-scoped events");
    }
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
