import { GraphQLError, Kind, type GraphQLResolveInfo, type SelectionSetNode } from "graphql";
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

const RESOURCE_SELECTIONS = {
  channels: [
    "id",
    "name",
    "type",
    "visibility",
    "baseBranch",
    "viewerIsMember",
    "repo.id",
    "repo.name",
    "projects.id",
    "projects.name",
  ],
  channel: ["id", "name", "repo.id", "repo.name"],
  repos: ["id", "name", "provider", "remoteUrl", "defaultBranch"],
  repo: ["id", "name", "provider", "remoteUrl", "defaultBranch"],
  projects: ["id", "name", "repo.id", "repo.name"],
  project: ["id", "name", "repo.id", "repo.name"],
} as const;

const SESSION_SELECTIONS = [
  "id",
  "name",
  "agentStatus",
  "sessionStatus",
  "tool",
  "model",
  "reasoningEffort",
  "hosting",
  "branch",
  "sessionGroupId",
  "createdAt",
  "updatedAt",
  "channel.id",
  "channel.name",
  "channel.repo.id",
  "channel.repo.name",
  "repo.id",
  "repo.name",
  "projects.id",
  "connection.environmentId",
  "connection.runtimeInstanceId",
  "sessionGroup.kind",
  "sessionGroup.visibility",
] as const;
const EVENT_SELECTIONS = ["id", "eventType", "scopeType", "scopeId", "timestamp", "payload"];

const ALLOWED_ARGUMENTS: Record<RootOperation, Readonly<Record<string, readonly string[]>>> = {
  Query: {
    channels: ["organizationId", "memberOnly"],
    channel: ["id"],
    repos: ["organizationId"],
    repo: ["id"],
    projects: ["organizationId", "repoId"],
    project: ["id"],
    sessions: [
      "organizationId",
      "filters.agentStatus",
      "filters.tool",
      "filters.repoId",
      "filters.channelId",
      "filters.includeArchived",
      "filters.includeMerged",
      "filters.limit",
    ],
    session: ["id"],
    events: ["organizationId", "scope.type", "scope.id", "limit", "before"],
  },
  Mutation: {
    startSession: [
      "input.clientMutationId",
      "input.kind",
      "input.tool",
      "input.model",
      "input.reasoningEffort",
      "input.visibility",
      "input.environmentId",
      "input.hosting",
      "input.runtimeInstanceId",
      "input.deferRuntimeSelection",
      "input.repoId",
      "input.branch",
      "input.ticketId",
      "input.channelId",
      "input.sessionGroupId",
      "input.projectId",
      "input.prompt",
      "input.interactionMode",
    ],
    sendSessionMessage: ["sessionId", "text", "interactionMode", "clientMutationId"],
    queueSessionMessage: ["sessionId", "text", "interactionMode"],
    runSession: ["id", "prompt", "interactionMode"],
    terminateSession: ["id"],
    archiveSessionGroup: ["id"],
  },
  Subscription: {
    sessionEvents: ["sessionId", "organizationId", "after", "afterEventId"],
  },
};

const ALLOWED_SELECTIONS: Record<RootOperation, Readonly<Record<string, readonly string[]>>> = {
  Query: {
    ...RESOURCE_SELECTIONS,
    sessions: SESSION_SELECTIONS,
    session: SESSION_SELECTIONS,
    events: EVENT_SELECTIONS,
  },
  Mutation: {
    startSession: SESSION_SELECTIONS,
    sendSessionMessage: EVENT_SELECTIONS,
    queueSessionMessage: ["id", "sessionId", "text", "position", "createdAt"],
    runSession: SESSION_SELECTIONS,
    terminateSession: SESSION_SELECTIONS,
    archiveSessionGroup: ["id", "name", "status", "archivedAt"],
  },
  Subscription: {
    sessionEvents: EVENT_SELECTIONS,
  },
};

function forbidden(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

function assertAllowedArguments(
  operation: RootOperation,
  field: string,
  args: Record<string, unknown>,
): void {
  const allowed = new Set(ALLOWED_ARGUMENTS[operation][field] ?? []);

  const visit = (value: Record<string, unknown>, prefix: string): void => {
    for (const [name, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${name}` : name;
      const isAllowed = allowed.has(path);
      const hasAllowedChild = [...allowed].some((candidate) => candidate.startsWith(`${path}.`));
      if (!isAllowed && !hasAllowedChild) {
        forbidden(`The session credential cannot pass ${operation}.${field}.${path}`);
      }
      if (child && typeof child === "object" && !Array.isArray(child) && !(child instanceof Date)) {
        visit(child as Record<string, unknown>, path);
      }
    }
  };

  visit(args, "");
}

function assertAllowedSelectionSet(
  operation: RootOperation,
  field: string,
  info: GraphQLResolveInfo,
): void {
  const allowed = new Set(ALLOWED_SELECTIONS[operation][field] ?? []);
  const visitedFragments = new Set<string>();

  const visit = (selectionSet: SelectionSetNode | undefined, prefix: string): void => {
    for (const selection of selectionSet?.selections ?? []) {
      if (selection.kind === Kind.FIELD) {
        const name = selection.name.value;
        if (name === "__typename") continue;
        const path = prefix ? `${prefix}.${name}` : name;
        const isAllowed = allowed.has(path);
        const hasAllowedChild = [...allowed].some((candidate) => candidate.startsWith(`${path}.`));
        if (!isAllowed && !hasAllowedChild) {
          forbidden(`The session credential cannot select ${operation}.${field}.${path}`);
        }
        visit(selection.selectionSet, path);
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        visit(selection.selectionSet, prefix);
      } else {
        const fragmentName = selection.name.value;
        if (visitedFragments.has(fragmentName)) continue;
        visitedFragments.add(fragmentName);
        visit(info.fragments[fragmentName]?.selectionSet, prefix);
      }
    }
  };

  for (const fieldNode of info.fieldNodes) visit(fieldNode.selectionSet, "");
}

function assertAgentRequest(
  ctx: Context,
  operation: RootOperation,
  field: string,
  args: Record<string, unknown>,
  info?: GraphQLResolveInfo,
): void {
  if (!ctx.agentSessionId) return;

  const capability = ALLOWED_FIELDS[operation][field];
  if (!capability || !ctx.agentCapabilities?.includes(capability)) {
    forbidden(`The session credential cannot perform ${operation}.${field}`);
  }
  assertAllowedArguments(operation, field, args);
  if (info) assertAllowedSelectionSet(operation, field, info);

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
