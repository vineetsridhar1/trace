import assert from "node:assert/strict";
import test from "node:test";
import { traceMarkers } from "./trace-markers-plugin";

type TransformFn = (code: string, id: string) => { code: string; map: null } | null;
type ConfigFn = (config: { root: string }) => void;

const ROOT = "/project";

function transform(code: string, relPath: string): { code: string; map: null } | null {
  const plugin = traceMarkers();
  (plugin.configResolved as unknown as ConfigFn)({ root: ROOT });
  return (plugin.transform as unknown as TransformFn)(code, `${ROOT}/${relPath}`);
}

const DESIGN_FILE = "src/design/screens/Foo.tsx";

test("stamps ids and source on untagged elements", () => {
  const code = `const s = <main><h1 data-trace-id="mine">Hi</h1><img /></main>;`;
  const result = transform(code, DESIGN_FILE);
  assert.ok(result);
  assert.match(result.code, /<main data-trace-id="t-0" data-trace-source="src\/design\/screens\/Foo.tsx">/);
  assert.match(result.code, /<img data-trace-id="t-0.1" data-trace-source="src\/design\/screens\/Foo.tsx" \/>/);
});

test("preserves author ids and only fills the missing source", () => {
  const code = `const s = <main><h1 data-trace-id="mine">Hi</h1><img /></main>;`;
  const result = transform(code, DESIGN_FILE);
  assert.ok(result);
  // The author id is untouched; source is added; no second data-trace-id is injected.
  assert.match(result.code, /<h1 data-trace-source="src\/design\/screens\/Foo.tsx" data-trace-id="mine">/);
  assert.equal(result.code.match(/data-trace-id="mine"/g)?.length, 1);
});

test("ignores files outside src/design", () => {
  const code = `const s = <main><h1>Hi</h1></main>;`;
  assert.equal(transform(code, "src/canvas/Other.tsx"), null);
});
