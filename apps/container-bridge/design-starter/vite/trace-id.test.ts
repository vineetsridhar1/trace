import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { buildDesignTraceIds } from "./trace-id";

// This fixture and its expected ids are mirrored in the Trace server's
// apps/server/src/services/design-trace-id.test.ts. Both sides MUST agree — this
// plugin stamps these ids and the server recomputes them to resolve manual edits.
const FIXTURE = `export default function Screen() {
  return (
    <main>
      <header>
        <span>Brand</span>
      </header>
      <section>
        <h1>Title</h1>
        {show && <p>Maybe</p>}
        <ul>
          {items.map((item) => (
            <li>Item</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
`;

function idsByTag(source: string): Record<string, string> {
  const sourceFile = ts.createSourceFile(
    "Screen.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const result: Record<string, string> = {};
  for (const [node, id] of buildDesignTraceIds(sourceFile)) {
    const tag = ts.isJsxElement(node)
      ? node.openingElement.tagName.getText(sourceFile)
      : ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(sourceFile)
        : "fragment";
    result[tag] = id;
  }
  return result;
}

test("trace ids match the shared golden fixture", () => {
  assert.deepEqual(idsByTag(FIXTURE), {
    main: "t-0",
    header: "t-0.0",
    span: "t-0.0.0",
    section: "t-0.1",
    h1: "t-0.1.0",
    p: "t-0.1.1",
    ul: "t-0.1.2",
    li: "t-0.1.2.0",
  });
});
