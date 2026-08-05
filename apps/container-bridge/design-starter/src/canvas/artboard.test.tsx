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

// The room a stacked section leaves above its artboards.
const STACKED_CLEARANCE = 310;

function renderArtboard(zoom: number, clearanceAbove = Number.POSITIVE_INFINITY) {
  return renderToStaticMarkup(
    <DesignArtboard
      screen={screen}
      component={() => <div>Screen content</div>}
      zoom={zoom}
      clearanceAbove={clearanceAbove}
    />,
  );
}

function renderSectionLabel(zoom: number, clearanceAbove = Number.POSITIVE_INFINITY) {
  return renderToStaticMarkup(
    <DesignSectionLabel name="Key states" zoom={zoom} clearanceAbove={clearanceAbove} />,
  );
}

test("keeps the screen label constant-sized and on one line", () => {
  const html = renderArtboard(0.5);

  assert.match(html, /bottom:868px/);
  assert.match(html, /transform:scale\(2\)/);
  assert.equal((html.match(/truncate/g) ?? []).length, 2);
  assert.match(html, /Screen content/);
});

test("anchors the section label to the bottom of its zero-height wrapper", () => {
  const html = renderSectionLabel(0.5);

  // Bottom anchoring is what keeps the gap below the label constant across zoom levels.
  assert.match(html, /bottom-0/);
  assert.match(html, /origin-bottom-left/);
  assert.match(html, /transform:scale\(2\)/);
});

test("hides labels once they would dwarf the artboards", () => {
  assert.doesNotMatch(renderArtboard(0.15), /Welcome/);
  assert.match(renderArtboard(0.15), /Screen content/);
  assert.equal(renderSectionLabel(0.15), "");
});

test("hides labels once they would run into the artboards above", () => {
  // 78px of screen label needs 78px of room: 310 canvas px covers it at 0.3 zoom, not 0.2.
  assert.match(renderArtboard(0.3, STACKED_CLEARANCE), /Welcome/);
  assert.doesNotMatch(renderArtboard(0.2, STACKED_CLEARANCE), /Welcome/);
  // The taller 164px section label runs out of room sooner.
  assert.notEqual(renderSectionLabel(0.6, STACKED_CLEARANCE), "");
  assert.equal(renderSectionLabel(0.4, STACKED_CLEARANCE), "");
});
