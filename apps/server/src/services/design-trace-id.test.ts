import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildDesignTraceIds } from "./design-trace-id.js";

// This fixture and its expected ids are mirrored in the design-starter's
// vite/trace-id.test.ts. Both sides MUST agree — the build transform stamps these
// ids and this resolver recomputes them.
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
  const sourceFile = ts.createSourceFile("Screen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

describe("design trace id", () => {
  it("assigns stable structural ids across the JSX-element tree", () => {
    expect(idsByTag(FIXTURE)).toEqual({
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

  it("treats conditional and mapped JSX as children of their nearest JSX ancestor", () => {
    // `{show && <p>}` and `{items.map(() => <li>)}` resolve to section/ul, not the file root.
    const ids = idsByTag(FIXTURE);
    expect(ids.p.startsWith("t-0.1.")).toBe(true);
    expect(ids.li.startsWith("t-0.1.2.")).toBe(true);
  });
});
