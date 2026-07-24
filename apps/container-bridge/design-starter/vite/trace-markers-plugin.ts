import { relative, resolve, sep } from "node:path";
import ts from "typescript";
import type { Plugin } from "vite";
import { buildDesignTraceIds } from "./trace-id";

/**
 * Stamps every JSX element under `src/design/**` with a build-time `data-trace-id`
 * and `data-trace-source` unless the author already tagged it. This gives the Trace
 * editor a stable identity anchor on every rendered element — so text and style
 * edits work without the design agent having to hand-author ids — while keeping the
 * source files clean (the attributes only exist in the served output).
 *
 * The ids are recomputed from source by the Trace server to resolve manual edits, so
 * they are produced by the shared `buildDesignTraceIds` used on both sides.
 */
export function traceMarkers(): Plugin {
  let root = "";
  let designDir = "";

  const hasAttribute = (element: ts.JsxOpeningLikeElement, name: string, sourceFile: ts.SourceFile) =>
    element.attributes.properties.some(
      (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
    );

  // A structural id identifies one JSX node in source, but an iteration callback
  // (`items.map((i) => <li/>)`) renders that one node many times. Stamping a shared
  // id on all of them would make a style edit bleed across every sibling, so we skip
  // injection and let the runtime discovery pass give each instance a unique id. This
  // only affects whether we inject — the id numbering is unchanged, so the server can
  // still recompute matching ids for the elements that do get stamped.
  const isInsideIteration = (node: ts.Node): boolean => {
    let current = node.parent as ts.Node | undefined;
    while (current) {
      if (ts.isJsxElement(current) || ts.isJsxFragment(current)) return false;
      if (
        (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
        ts.isCallExpression(current.parent) &&
        current.parent.arguments.includes(current as ts.Expression)
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  };

  return {
    name: "trace-markers",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      designDir = resolve(config.root, "src", "design") + sep;
    },
    transform(code, id) {
      const filePath = id.split("?")[0]!;
      if (!filePath.endsWith(".tsx") || !filePath.startsWith(designDir)) return null;

      const source = relative(root, filePath).split(sep).join("/");
      const sourceFile = ts.createSourceFile(
        filePath,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      const edits: { offset: number; text: string }[] = [];
      for (const [node, traceId] of buildDesignTraceIds(sourceFile)) {
        // Fragments (`<>`) render no DOM node and cannot carry attributes.
        if (ts.isJsxFragment(node)) continue;
        if (isInsideIteration(node)) continue;
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const insertions: string[] = [];
        if (!hasAttribute(opening, "data-trace-id", sourceFile)) {
          insertions.push(`data-trace-id="${traceId}"`);
        }
        if (!hasAttribute(opening, "data-trace-source", sourceFile)) {
          insertions.push(`data-trace-source="${source}"`);
        }
        if (insertions.length > 0) {
          edits.push({ offset: opening.tagName.getEnd(), text: ` ${insertions.join(" ")}` });
        }
      }
      if (edits.length === 0) return null;

      edits.sort((a, b) => b.offset - a.offset);
      let output = code;
      for (const edit of edits) {
        output = `${output.slice(0, edit.offset)}${edit.text}${output.slice(edit.offset)}`;
      }
      return { code: output, map: null };
    },
  };
}
