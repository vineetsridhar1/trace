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

test("positions the constant-size label above the artboard", () => {
  const html = renderToStaticMarkup(
    <DesignArtboard
      screen={screen}
      sectionName="Onboarding"
      component={() => <div>Screen content</div>}
      onFocus={() => undefined}
      zoom={1}
    />,
  );

  assert.match(html, /bottom:856px/);
  assert.match(html, /Screen content/);
});
