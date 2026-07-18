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

test("positions the canvas-scaled screen label above the artboard", () => {
  const html = renderToStaticMarkup(
    <DesignArtboard
      screen={screen}
      component={() => <div>Screen content</div>}
      onFocus={() => undefined}
    />,
  );

  assert.match(html, /bottom:856px/);
  assert.doesNotMatch(html, /scale\(/);
  assert.match(html, /Screen content/);
});
