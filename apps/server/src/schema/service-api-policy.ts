import {
  GraphQLError,
  Kind,
  getOperationAST,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type GraphQLResolveInfo,
  type SelectionSetNode,
} from "graphql";
import type { ServiceApiScope } from "@trace/gql";
import type { Context } from "../context.js";

type ServiceRootType = "Query" | "Mutation" | "Subscription";
type ServiceOperationKey = `${ServiceRootType}.${string}`;

export type ServicePermissionRequirement = {
  allOf?: readonly ServiceApiScope[];
  anyOf?: readonly ServiceApiScope[];
};

/**
 * Central service-credential policy registry. New GraphQL fields opt in here;
 * future REST endpoints or RBAC roles can reuse `assertServicePermissions`
 * against the same permission requirements.
 */
export const SERVICE_API_POLICIES = {
  "Mutation.startServiceSession": { allOf: ["sessions_start"] },
  "Query.serviceSessionStatus": { allOf: ["sessions_status_read"] },
} as const satisfies Partial<Record<ServiceOperationKey, ServicePermissionRequirement>>;

function forbidden(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "FORBIDDEN", http: { status: 403 } },
  });
}

export function assertServicePermissions(
  grantedScopes: readonly ServiceApiScope[],
  requirement: ServicePermissionRequirement,
): void {
  const granted = new Set(grantedScopes);
  const missing = requirement.allOf?.find((scope) => !granted.has(scope));
  if (missing) {
    throw forbidden(`Service token is missing required scope: ${missing}`);
  }
  if (requirement.anyOf?.length && !requirement.anyOf.some((scope) => granted.has(scope))) {
    throw forbidden(`Service token requires one of these scopes: ${requirement.anyOf.join(", ")}`);
  }
}

export function assertServiceOperationAllowed(
  context: Context,
  rootType: ServiceRootType,
  fieldName: string,
): void {
  if (context.authKind !== "service") return;
  const key = `${rootType}.${fieldName}` as ServiceOperationKey;
  const requirement = SERVICE_API_POLICIES[key as keyof typeof SERVICE_API_POLICIES];
  if (!requirement) {
    throw forbidden("Service token is not authorized for this operation");
  }
  assertServicePermissions(context.serviceApiScopes, requirement);
}

type RootResolver = (
  parent: unknown,
  args: Record<string, unknown>,
  context: Context,
  info: GraphQLResolveInfo,
) => unknown;

type RootResolverConfig = {
  resolve?: RootResolver;
  subscribe?: RootResolver;
  [key: string]: unknown;
};

function guardResolver(
  rootType: ServiceRootType,
  fieldName: string,
  resolver: RootResolver,
): RootResolver {
  return (parent, args, context, info) => {
    assertServiceOperationAllowed(context, rootType, fieldName);
    return resolver(parent, args, context, info);
  };
}

export function guardServiceTokenRootResolvers(
  rootType: ServiceRootType,
  resolvers: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(resolvers).map(([fieldName, resolver]) => {
      if (typeof resolver === "function") {
        return [fieldName, guardResolver(rootType, fieldName, resolver as RootResolver)];
      }
      if (resolver && typeof resolver === "object") {
        const config = resolver as RootResolverConfig;
        return [
          fieldName,
          {
            ...config,
            ...(config.resolve
              ? { resolve: guardResolver(rootType, fieldName, config.resolve) }
              : {}),
            ...(config.subscribe
              ? { subscribe: guardResolver(rootType, fieldName, config.subscribe) }
              : {}),
          },
        ];
      }
      return [fieldName, resolver];
    }),
  );
}

function collectRootFields(
  selectionSet: SelectionSetNode,
  fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>,
): FieldNode[] {
  const fields: FieldNode[] = [];
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      fields.push(selection);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      fields.push(...collectRootFields(selection.selectionSet, fragments, visitedFragments));
    } else {
      if (visitedFragments.has(selection.name.value)) continue;
      visitedFragments.add(selection.name.value);
      const fragment = fragments.get(selection.name.value);
      if (fragment) {
        fields.push(...collectRootFields(fragment.selectionSet, fragments, visitedFragments));
      }
    }
  }
  return fields;
}

/**
 * Preflight the complete operation before execution. This blocks introspection
 * and prevents an allowed mutation from running before a later forbidden root
 * field in the same document is rejected.
 */
export function assertServiceTokenDocumentAllowed(
  document: DocumentNode,
  operationName: string | null | undefined,
  context: Context,
): void {
  if (context.authKind !== "service") return;
  const operation = getOperationAST(document, operationName ?? undefined);
  if (!operation) throw forbidden("Service token operation could not be resolved");

  const rootType: ServiceRootType =
    operation.operation === "mutation"
      ? "Mutation"
      : operation.operation === "subscription"
        ? "Subscription"
        : "Query";
  const fragments = new Map(
    document.definitions
      .filter(
        (definition): definition is FragmentDefinitionNode =>
          definition.kind === Kind.FRAGMENT_DEFINITION,
      )
      .map((fragment) => [fragment.name.value, fragment]),
  );
  const fields = collectRootFields(operation.selectionSet, fragments, new Set());
  for (const field of fields) {
    assertServiceOperationAllowed(context, rootType, field.name.value);
  }
}
