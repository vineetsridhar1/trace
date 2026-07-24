import ts from "typescript";

/**
 * Identity anchors for design elements.
 *
 * Every JSX element in a design source file that the author did not tag by hand
 * receives a deterministic `data-trace-id` at build time (see the design-starter
 * Vite `trace-markers` plugin). The same id is recomputed here from source so the
 * manual-edit resolvers can locate the JSX node without the id being written into
 * the file. The two implementations MUST stay byte-for-byte equivalent — the
 * golden test in `design-trace-id.test.ts` mirrors the one in the design-starter.
 *
 * Ids are non-semantic on purpose: the tree label comes from `data-trace-label`
 * or text content, never from this id.
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
 * element's position in the JSX-element tree — its index among siblings that share
 * the same nearest JSX ancestor, walked up to the file root. Text, expressions, and
 * whitespace are ignored so the path is parser-independent as long as both sides
 * use the TypeScript AST.
 */
export function buildDesignTraceIds(sourceFile: ts.SourceFile): Map<JsxContainer, string> {
  const all = collectJsxNodes(sourceFile);
  const parentOf = new Map<JsxContainer, JsxContainer | null>();
  const siblingIndex = new Map<JsxContainer, number>();
  const counters = new Map<JsxContainer | null, number>();

  // `all` is in source order (pre-order walk), so assigning indices in this order
  // gives each group its source-order sibling positions.
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
