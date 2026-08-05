import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignArtboard } from "./DesignArtboard";
import { DesignSectionLabel } from "./DesignSectionLabel";
import type { DesignScreen } from "./manifest";

const screen: DesignScreen = {
  id: "welcome",
  name: "Welcome",
  component: "./screens/WelcomeScreen.tsx",
  variation: "Primary",
  state: "Default",
  viewport: { width: 390, height: 844 },
};

test("keeps the screen label constant-sized and on one line", () => {
  const html = renderToStaticMarkup(
    <DesignArtboard screen={screen} component={() => <div>Screen content</div>} zoom={0.5} />,
  );

  assert.match(html, /bottom:868px/);
  assert.match(html, /transform:scale\(2\)/);
  assert.equal((html.match(/truncate/g) ?? []).length, 2);
  assert.match(html, /Screen content/);
});

test("anchors the section label to the bottom of its zero-height wrapper", () => {
  const html = renderToStaticMarkup(<DesignSectionLabel name="Key states" zoom={0.5} />);

  // Bottom anchoring is what keeps the gap below the label constant across zoom levels.
  assert.match(html, /bottom-0/);
  assert.match(html, /origin-bottom-left/);
  assert.match(html, /transform:scale\(2\)/);
});

test("hides the section label once it would dwarf the artboards", () => {
  assert.equal(renderToStaticMarkup(<DesignSectionLabel name="Key states" zoom={0.15} />), "");
});

test("hides the screen label once it would dwarf the artboard", () => {
  const html = renderToStaticMarkup(
    <DesignArtboard screen={screen} component={() => <div>Screen content</div>} zoom={0.15} />,
  );

  assert.doesNotMatch(html, /Welcome/);
  assert.match(html, /Screen content/);
});
