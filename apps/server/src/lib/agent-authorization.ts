import {
  traceCliOperationByName,
  type TraceCliOperation,
  type TraceCliOperationType,
} from "@trace/cli-contract";
import { GraphQLError, print, stripIgnoredCharacters, type GraphQLResolveInfo } from "graphql";
import type { Context } from "../context.js";

type RootOperation = "Query" | "Mutation" | "Subscription";
type ResolverFunction = (...args: unknown[]) => unknown;

const OPERATION_TYPES: Readonly<Record<RootOperation, TraceCliOperationType>> = {
  Query: "query",
  Mutation: "mutation",
  Subscription: "subscription",
};

function forbidden(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

export function assertAllowedArguments(
  definition: TraceCliOperation,
  operation: RootOperation,
  field: string,
  args: Record<string, unknown>,
): void {
  const allowed = new Set(definition.argumentPaths);

  const visit = (value: unknown, prefix: string): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, prefix);
      return;
    }
    if (!value || typeof value !== "object" || value instanceof Date) return;

    for (const [name, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${name}` : name;
      const isAllowed = allowed.has(path);
      const hasAllowedChild = definition.argumentPaths.some((candidate) =>
        candidate.startsWith(`${path}.`),
      );
      if (!isAllowed && !hasAllowedChild) {
        forbidden(`The session credential cannot pass ${operation}.${field}.${path}`);
      }
      visit(child, path);
    }
  };

  visit(args, "");
}

function registeredOperation(
  operation: RootOperation,
  field: string,
  info: GraphQLResolveInfo | undefined,
): TraceCliOperation {
  const name = info?.operation.name?.value;
  if (!name) forbidden("Session credentials must use a registered Trace CLI operation");
  const definition = traceCliOperationByName(name);
  if (
    !definition ||
    definition.type !== OPERATION_TYPES[operation] ||
    definition.rootField !== field
  ) {
    forbidden(`The session credential cannot perform ${operation}.${field}`);
  }

  const requestedDocument = stripIgnoredCharacters(print(info.operation));
  const registeredDocument = stripIgnoredCharacters(definition.document);
  if (requestedDocument !== registeredDocument) {
    forbidden(`The session credential cannot modify the registered operation ${name}`);
  }
  return definition;
}

function assertAgentRequest(
  ctx: Context,
  operation: RootOperation,
  field: string,
  args: Record<string, unknown>,
  info?: GraphQLResolveInfo,
): void {
  if (!ctx.agentSessionId) return;

  const definition = registeredOperation(operation, field, info);
  if (!ctx.agentCapabilities?.includes(definition.capability)) {
    forbidden(`The session credential cannot perform ${operation}.${field}`);
  }
  assertAllowedArguments(definition, operation, field, args);

  const requestedOrganizationId =
    typeof args.organizationId === "string" ? args.organizationId : null;
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

function wrapFunction(
  resolver: ResolverFunction,
  operation: RootOperation,
  field: string,
): ResolverFunction {
  return (...resolverArgs: unknown[]) => {
    const args = (resolverArgs[1] ?? {}) as Record<string, unknown>;
    const ctx = resolverArgs[2] as Context;
    const info = resolverArgs[3] as GraphQLResolveInfo | undefined;
    assertAgentRequest(ctx, operation, field, args, info);
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
