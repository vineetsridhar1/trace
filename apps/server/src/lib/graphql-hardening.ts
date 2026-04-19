import type { GraphQLError, ValidationContext } from "graphql";
import { GraphQLError as GraphQLErrorClass, Kind } from "graphql";
import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  OperationDefinitionNode,
  SelectionNode,
} from "graphql";

const MAX_DEPTH = 10;
const MAX_ALIASES = 200;

export function depthLimitRule(context: ValidationContext) {
  const document = context.getDocument();
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of document.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  }

  function depthOfSelection(
    selection: SelectionNode,
    visitedFragments: Set<string>,
  ): number {
    if (selection.kind === Kind.FIELD) {
      return 1 + depthOfSelectionSet((selection as FieldNode).selectionSet?.selections ?? [], visitedFragments);
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      return depthOfSelectionSet((selection as InlineFragmentNode).selectionSet.selections, visitedFragments);
    }
    // Fragment spread
    const name = (selection as FragmentSpreadNode).name.value;
    if (visitedFragments.has(name)) return 0;
    visitedFragments.add(name);
    const frag = fragments.get(name);
    if (!frag) return 0;
    return depthOfSelectionSet(frag.selectionSet.selections, visitedFragments);
  }

  function depthOfSelectionSet(
    selections: readonly SelectionNode[],
    visitedFragments: Set<string>,
  ): number {
    let max = 0;
    for (const sel of selections) {
      const d = depthOfSelection(sel, new Set(visitedFragments));
      if (d > max) max = d;
    }
    return max;
  }

  return {
    OperationDefinition(node: OperationDefinitionNode) {
      const depth = depthOfSelectionSet(node.selectionSet.selections, new Set());
      if (depth > MAX_DEPTH) {
        context.reportError(
          new GraphQLErrorClass(
            `Query exceeds maximum depth of ${MAX_DEPTH} (got ${depth})`,
            { nodes: [node] },
          ),
        );
      }
    },
  };
}

export function aliasLimitRule(context: ValidationContext) {
  let aliasCount = 0;
  return {
    Field(node: FieldNode) {
      if (node.alias) aliasCount++;
      if (aliasCount > MAX_ALIASES) {
        context.reportError(
          new GraphQLErrorClass(
            `Query exceeds maximum aliases (${MAX_ALIASES})`,
            { nodes: [node] },
          ),
        );
      }
    },
  };
}

export function hardeningValidationRules() {
  return [depthLimitRule, aliasLimitRule];
}

import type { GraphQLFormattedError } from "graphql";

export function formatGraphQLError(
  formatted: GraphQLFormattedError,
  _error: unknown,
): GraphQLFormattedError {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) return formatted;
  // Strip stacktrace and internal details in production; keep only the
  // minimal fields clients need to render a user-facing error.
  const code = formatted.extensions?.code;
  return {
    message: formatted.message,
    ...(code ? { extensions: { code } } : {}),
  };
}

export function countedDocument(document: DocumentNode): number {
  let total = 0;
  for (const def of document.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) total++;
  }
  return total;
}

// Suppress unused type references for tooling
export type _AssertGraphQLError = GraphQLError;
