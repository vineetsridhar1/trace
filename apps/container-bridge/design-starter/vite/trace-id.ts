import ts from "typescript";

/**
 * Deterministic identity anchors for design elements.
 *
 * The `trace-markers` Vite plugin stamps every JSX element that the author did not
 * tag by hand with a `data-trace-id` computed here. The Trace server recomputes the
 * exact same id from source (apps/server/src/services/design-trace-id.ts) to locate
 * the JSX node when a manual text edit is saved. The two implementations MUST stay
 * equivalent — a shared golden fixture guards the parity (see trace-id.test.ts).
 *
 * Ids are intentionally non-semantic: the editor's tree label comes from
 * `data-trace-label` or text content, never from this id.
 */
export const TRACE_AUTO_ID_PREFIX = "t-";

type JsxContainer = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;

function isJsxNode(node: ts.Node): node is JsxContainer {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

function collectJsxNodes(sourceFile: ts.SourceFile): JsxContainer[] {
  const nodes: JsxContainer[] = [];
  const visit = (node: ts.Node): void => {
    if (isJsxNode(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return nodes;
}

function nearestJsxAncestor(node: ts.Node): JsxContainer | null {
  let current = node.parent as ts.Node | undefined;
  while (current) {
    if (isJsxNode(current)) return current;
    current = current.parent;
  }
  return null;
}

/**
 * Computes the stable trace id for every JSX node in the file. The id encodes the
 * element's index among siblings that share the same nearest JSX ancestor, walked up
 * to the file root, so it is independent of text/whitespace formatting.
 */
export function buildDesignTraceIds(sourceFile: ts.SourceFile): Map<JsxContainer, string> {
  const all = collectJsxNodes(sourceFile);
  const parentOf = new Map<JsxContainer, JsxContainer | null>();
  const siblingIndex = new Map<JsxContainer, number>();
  const counters = new Map<JsxContainer | null, number>();

  for (const node of all) {
    const parent = nearestJsxAncestor(node);
    parentOf.set(node, parent);
    const index = counters.get(parent) ?? 0;
    siblingIndex.set(node, index);
    counters.set(parent, index + 1);
  }

  const ids = new Map<JsxContainer, string>();
  for (const node of all) {
    const path: number[] = [];
    let current: JsxContainer | null = node;
    while (current) {
      path.unshift(siblingIndex.get(current) ?? 0);
      current = parentOf.get(current) ?? null;
    }
    ids.set(node, `${TRACE_AUTO_ID_PREFIX}${path.join(".")}`);
  }
  return ids;
}
