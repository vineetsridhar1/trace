import { describe, expect, it } from "vitest";
import { validatePlanHtml } from "./plan-html.js";

const page = (body: string) =>
  `<!doctype html><html><head><style>.x{color:red}</style></head><body>${body}</body></html>`;

describe("validatePlanHtml", () => {
  it("accepts an inlined page with data: images", () => {
    expect(() =>
      validatePlanHtml(
        page('<h1>Plan</h1><img src="data:image/png;base64,iVBORw0KGgo=" alt="" />'),
      ),
    ).not.toThrow();
  });

  it("accepts inline scripts and rejects script sources", () => {
    expect(() =>
      validatePlanHtml(
        page("<button id=toggle>Toggle</button><script>toggle.hidden=true</script>"),
      ),
    ).not.toThrow();
    expect(() => validatePlanHtml(page('<script src="./app.js"></script>'))).toThrow("inline");
    expect(() =>
      validatePlanHtml(page('<script src="data:text/javascript,alert(1)"></script>')),
    ).toThrow("inline");
  });

  it("rejects references that cannot survive as a single file", () => {
    expect(() => validatePlanHtml(page('<img src="assets/flow.png" />'))).toThrow(
      "remove the external reference to assets/flow.png",
    );
    expect(() => validatePlanHtml('<link rel="stylesheet" href="plan.css" />')).toThrow(
      "remove the external reference to plan.css",
    );
    expect(() => validatePlanHtml("<style>.x{background:url(./bg.png)}</style>")).toThrow(
      "external CSS asset ./bg.png",
    );
    expect(() => validatePlanHtml('<style>@import "https://fonts.example/x.css";</style>')).toThrow(
      "@import",
    );
    expect(() => validatePlanHtml(page("<img src=https://tracker.example/pixel>"))).toThrow(
      "tracker.example",
    );
    expect(() =>
      validatePlanHtml(page('<video poster="https://tracker.example/pixel"></video>')),
    ).toThrow("tracker.example");
    expect(() => validatePlanHtml(page('<img srcset="https://tracker.example/pixel 1x">'))).toThrow(
      "srcset",
    );
    expect(() =>
      validatePlanHtml('<meta http-equiv="refresh" content="0;url=https://tracker.example/">'),
    ).toThrow("meta refresh");
  });

  it("allows in-page anchors", () => {
    expect(() => validatePlanHtml(page('<a href="#risks">Risks</a>'))).not.toThrow();
    expect(() => validatePlanHtml("<style>.x{mask:url(#shape)}</style>")).not.toThrow();
  });

  it("ignores comments, which neither render nor load", () => {
    expect(() =>
      validatePlanHtml(page('<!-- no <script>, no <img src="remote.png"> -->')),
    ).not.toThrow();
  });

  // Plans are authored from a written brief rather than copied from a starter file, so this
  // fixture stands in for the shipped starter: it exercises every construct the brief tells
  // agents to reach for. A tightening of the rules above that breaks planning for every agent
  // at once should fail here first.
  it("accepts a document using the full authored-plan surface", () => {
    const plan = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Plan</title>
<style>
  :root { --ink: #1c1a17; --accent: #4c3ad6; }
  @media (prefers-color-scheme: dark) { :root { --ink: #edebf2; } }
  body { color: var(--ink); font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; }
  .hero { background: url("data:image/png;base64,iVBORw0KGgo="); }
  .masked { mask: url(#cutout); }
  .figure svg { width: 100%; height: auto; }
</style>
</head>
<body>
<!-- Authored, not copied: <script src="app.js"> and <img src="remote.png"> stay out. -->
<h1>Replace the widget pipeline</h1>
<p><a href="#risks">Jump to risks</a></p>

<figure class="figure">
  <svg viewBox="0 0 400 160" role="img" aria-labelledby="t d">
    <title id="t">Request flow</title>
    <desc id="d">A request passes a gate and is either published or returned.</desc>
    <defs>
      <marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
        <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--accent)" />
      </marker>
      <clipPath id="cutout"><circle cx="40" cy="40" r="20" /></clipPath>
    </defs>
    <path d="M40 80 H160" stroke="var(--accent)" stroke-width="2" marker-end="url(#arrow)" />
    <rect x="180" y="52" width="120" height="56" rx="8" fill="none" stroke="var(--accent)" />
    <text x="240" y="86" text-anchor="middle" style="font-size:13px">gate</text>
  </svg>
  <figcaption>Everything that crosses the boundary is drawn.</figcaption>
</figure>

<img src="data:image/png;base64,iVBORw0KGgo=" alt="" style="background:url('data:image/gif;base64,R0lGOD')" />

<table>
  <thead><tr><th>Path</th><th>Change</th></tr></thead>
  <tbody><tr><td>src/widget.ts</td><td>Modify</td></tr></tbody>
</table>

<details id="risks">
  <summary>The migration is reversible in one commit</summary>
  <p>Supporting detail lives behind disclosure.</p>
</details>
</body>
</html>`;
    expect(() => validatePlanHtml(plan)).not.toThrow();
  });
});
