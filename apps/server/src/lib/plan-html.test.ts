import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

  it("rejects all scripts", () => {
    expect(() =>
      validatePlanHtml(
        page("<button id=toggle>Toggle</button><script>toggle.hidden=true</script>"),
      ),
    ).toThrow("must not contain <script>");
    expect(() => validatePlanHtml(page('<script src="./app.js"></script>'))).toThrow("<script>");
    expect(() =>
      validatePlanHtml(page('<script src="data:text/javascript,alert(1)"></script>')),
    ).toThrow("<script>");
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

  // The starter is what every plan is copied from, so a template that fails these rules would
  // break planning for every agent at once.
  it("accepts the shipped starter template", () => {
    const template = readFileSync(
      fileURLToPath(
        new URL("../../../../runtime/skills/visual-plan/template.html", import.meta.url),
      ),
      "utf8",
    );
    expect(() => validatePlanHtml(template)).not.toThrow();
  });
});
