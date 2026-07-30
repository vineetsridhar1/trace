import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignArtboard } from "./DesignArtboard";
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
