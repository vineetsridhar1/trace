import assert from "node:assert/strict";
import test from "node:test";
import source from "../../trace.tokens.json";
import { designTokenStyle, validateDesignTokens } from "./tokens";

test("validates the starter token contract and exposes executable CSS variables", () => {
  const tokens = validateDesignTokens(source);
  const style = designTokenStyle(tokens);

  assert.equal(style["--design-color-background"], source.color.background);
  assert.equal(style["--design-space"], `${source.spacing.base}px`);
  assert.equal(style["--design-motion-duration"], `${source.motion.duration}ms`);
});

test("rejects incomplete and unsafe token values", () => {
  assert.throws(
    () => validateDesignTokens({ ...source, color: { ...source.color, primary: "" } }),
    /color.primary must be a string/,
  );
  assert.throws(
    () =>
      validateDesignTokens({
        ...source,
        elevation: { surface: "none; body { display: none }" },
      }),
    /unsafe CSS character/,
  );
});
