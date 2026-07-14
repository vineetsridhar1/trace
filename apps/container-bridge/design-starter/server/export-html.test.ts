import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSelfContainedHtml, validateSelfContainedHtml } from "./export-html";

test("accepts inline scripts, styles, and data assets", () => {
  assert.doesNotThrow(() =>
    validateSelfContainedHtml(
      '<!doctype html><style>.x{background:url(data:image/png;base64,AA)}</style><img src="data:image/png;base64,AA"><script type="module">document.body.dataset.ready="1"</script>',
    ),
  );
});

test("rejects network and local asset references", () => {
  assert.throws(
    () => validateSelfContainedHtml('<script src="/assets/app.js"></script>'),
    /external asset/,
  );
  assert.throws(
    () => validateSelfContainedHtml("<style>.x{background:url(./photo.png)}</style>"),
    /external CSS asset/,
  );
});

test("builds the design runtime as one self-contained HTML file", async () => {
  const html = await buildSelfContainedHtml(fileURLToPath(new URL("..", import.meta.url)));
  assert.match(html, /<script type="module">/);
  assert.match(html, /<style>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref=/i);
  validateSelfContainedHtml(html);
});
